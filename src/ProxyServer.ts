import Dgram, { RemoteInfo, Socket } from 'dgram';

import BitFlags from '@jsprismarine/raknet/dist/protocol/BitFlags';
import ConfigBuilder from '@jsprismarine/prismarine/dist/config/ConfigBuilder';
import DownstreamConnection from './DownstreamConnection';
import LoggerBuilder from '@jsprismarine/prismarine/dist/utils/Logger';
import NetworkUtils from './NetworkUtils';
import RakNetIdentifiers from '@jsprismarine/raknet/dist/protocol/Identifiers';
import UpstreamConnection from './UpstreamConnection';
import UnconnectedPing from '@jsprismarine/raknet/dist/protocol/UnconnectedPing';
import OpenConnectionRequest2 from '@jsprismarine/raknet/dist/protocol/OpenConnectionRequest2';
import crypto from 'crypto'
import TempInetAddress from './TempInetAddress';

export default class ProxyServer {
    private socket: Socket;

    private upstreamConnection: UpstreamConnection;

    private networkUtils: NetworkUtils;
    private logger: LoggerBuilder;

    private clients: Map<string, DownstreamConnection> = new Map();

    public constructor(config: ConfigBuilder, logger: LoggerBuilder) {
        this.logger = logger;
        
        this.socket = Dgram.createSocket('udp4');
        const bindAddress: string = config.get('bindAddress', '0.0.0.0');
        const bindPort: number = config.get('bindPort', 19132);
        this.socket.bind(bindPort, bindAddress);
        
        const targetAddress: string = config.get('targetAddress', '165.232.37.93');
        const targetPort: number = config.get('targetPort', 19132);

        /* 
        TODO: hostname lookup
        if (!targetAddress.match('^.[0-9]{1,3}/..[0-9]{1,3}/..[0-9]{1,3}/..[0-9]{1,3}')) {
            // It's a hostname, let's lookup for IPv4 address
            console.log("Hostname")
            Dns.lookup(targetAddress, (err, result) => {
                targetAddress = result;
                if (err) {
                    logger.error(err.message);
                    process.exit(1);
                } 
            });
        } 
        */
        
        // Proxy -> Server
        this.upstreamConnection = new UpstreamConnection(targetAddress, targetPort, this);

        this.networkUtils = new NetworkUtils(this);

        logger.info(`Mitmarine started on address ${bindAddress}:${bindPort}!`);

        const tick = setInterval(() => {
            // Ping the server every second to make sure it is alive
            const unconnectedPing = new UnconnectedPing();
            unconnectedPing.sendTimestamp = BigInt(Date.now());
            unconnectedPing.clientGUID = crypto.randomBytes(8).readBigInt64BE();
            unconnectedPing.encode();
            this.networkUtils.writePacket(unconnectedPing.getBuffer(), this.upstreamConnection);

            // If we don't recive any pong in 10 seconds, kill the proxy
            if (Date.now() - this.upstreamConnection.lastPingTime > 10000 && this.clients.size === 0) {
                this.logger.error(`Target server is dead, proxy can't redirect players! killing proxy...`);
                this.socket.close();
                clearInterval(tick);
                process.exit(0);
            }
        }, 1000);

        // Handle the socket messages, both server and client will
        // send messages on the same socket
        this.handleNetworking();
    }

    private handleNetworking(): void {
        this.socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
            // The address of the packet sender, may be the server or the client
            const incomingAddress = new TempInetAddress(rinfo.address, rinfo.port);
            const packetId = msg.readUInt8();

            // Check if the packet is from the server and not the client
            if (incomingAddress.equals(this.upstreamConnection.getAddress())) {
                if ((packetId & BitFlags.VALID) === 0) {
                    // It's an offline packet
                    switch (packetId) {
                        case RakNetIdentifiers.UnconnectedPong:
                            this.upstreamConnection.lastPingTime = Date.now();
                            this.upstreamConnection.lastCachedPong = msg;
                            break;
                        default:
                            this.clients.forEach(client => {
                                // TODO: we should send the right packet to the right client...
                                this.getNetworkUtils().writePacket(msg, client);
                            });
                    }
                } else if (packetId & BitFlags.ACK || packetId & BitFlags.NACK) {
                    // Forward ACKs and NACKs to the client
                    this.clients.forEach(client => {
                        // TODO: we should send the right packet to the right client...
                        this.getNetworkUtils().writePacket(msg, client);
                    });
                } else {
                    // Forward to client (we can cancel forwardoing sometimes :P, eg. commands)
                    // TODO: events with cancellation / packet modification
                    this.clients.forEach(client => {
                        // TODO: we should send the right packet to the right client...
                        this.getNetworkUtils().writePacket(msg, client);
                    });
                    const packet = this.getNetworkUtils().readDataPacket(msg);
                }
            } else {
                // The packet is from a client, let's do login sequence
                if ((packetId & BitFlags.VALID) !== 0) {
                    if (packetId & BitFlags.ACK || packetId & BitFlags.NACK) {
                        // Forward ACKs from Client to Server
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                    } else {
                        // const datagram = new DataPacket(msg);
                        // datagram.decode();
                        // datagram.sequenceNumber = this.getNetworkUtils().sendSeqNumber++;

                        // Forward packets from Client to Server
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                        
                        // Read the packet that the client sent
                        this.getNetworkUtils().readDataPacket(msg);
                    }
                } else {
                    // Forward offline packets from the client
                    switch (packetId) {
                        case RakNetIdentifiers.UnconnectedPing:
                            const cachedPong = this.upstreamConnection.lastCachedPong;
                            this.socket.send(cachedPong, 0, cachedPong.length, incomingAddress.getPort(), incomingAddress.getAddress());
                            break;
                        case RakNetIdentifiers.OpenConnectionRequest1:
                            // Forward the packet to Server
                            this.getNetworkUtils().writePacket(msg, this.upstreamConnection);

                            // Cache the client connection
                            const token = this.getToken(incomingAddress);
                            if (this.clients.has(token)) {
                                return;
                            }

                            const clientConnection = new DownstreamConnection(incomingAddress, this);
                            this.clients.set(token, clientConnection);
                            
                            this.logger.info(`Client connected from [${token}]`);
                            break;
                        default:
                            this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                    }
                }
            }
        });
    }

    public getToken(inetAddr: TempInetAddress): string {
        return `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public getNetworkUtils(): NetworkUtils {
        return this.networkUtils
    }

    public getLogger(): LoggerBuilder {
        return this.logger;
    }
}