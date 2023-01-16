import Dgram, { RemoteInfo, Socket } from 'dgram';

import { Protocol } from './jsprismarine/packages/raknet/src/RakNet.js';
import DownstreamConnection from './DownstreamConnection.js';
import { Logger as LoggerBuilder, ConfigBuilder } from './jsprismarine/packages/prismarine/src/Prismarine.js';
import NetworkUtils from './NetworkUtils.js';
import UpstreamConnection from './UpstreamConnection.js';
import crypto from 'crypto';
import TempInetAddress from './TempInetAddress.js';

export default class ProxyServer {
    private socket: Socket;

    private upstreamConnection: UpstreamConnection;

    private networkUtils: NetworkUtils;
    private logger: LoggerBuilder;

    public clients: Map<string, DownstreamConnection> = new Map();

    public constructor(config: ConfigBuilder, logger: LoggerBuilder) {
        this.logger = logger;
        
        this.socket = Dgram.createSocket('udp4');
        const bindAddress: string = config.get('bindAddress', '127.0.0.1');
        const bindPort: number = config.get('bindPort', 19122);
        this.socket.bind(bindPort, bindAddress);
        
        const targetAddress: string = config.get('targetAddress', '127.0.0.1');
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

        /* const tick = */setInterval(() => {
            // Ping the server every second to make sure it is alive
            const unconnectedPing = new Protocol.UnconnectedPing();
            unconnectedPing.timestamp = BigInt(Date.now());
            // unconnectedPing.clientGUID = crypto.randomBytes(8).readBigInt64BE();
            unconnectedPing.encode();
            this.networkUtils.writePacket(unconnectedPing.getBuffer(), this.upstreamConnection);

            // If we don't recive any pong in 10 seconds, kill the proxy
            // if (Date.now() - this.upstreamConnection.lastPingTime > 10000 && this.clients.size === 0) {
            //    this.logger.error(`Target server is dead, proxy can't redirect players! killing proxy...`);
            //    this.socket.close();
            //    clearInterval(tick);
            //    process.exit(0);
            // }
        }, 500);

        // Handle the socket messages, both server and client will
        // send messages on the same socket
        this.socket.on('message', this.handleNetworking.bind(this));
    }

    private handleNetworking(msg: Buffer, rinfo: RemoteInfo): void {
        // The address of the packet sender, may be the server or the client
        const incomingAddress = new TempInetAddress(rinfo.address, rinfo.port);
        const packetId = msg.readUInt8();

        // Check if the packet is from the server and not the client
        if (incomingAddress.equals(this.upstreamConnection.getAddress())) {
            // Packets from the server
            if ((packetId & Protocol.BitFlags.VALID) === 0) {
                // It's an offline packet
                switch (packetId) {
                    case Protocol.MessageHeaders.UNCONNECTED_PONG:
                        this.upstreamConnection.lastPingTime = Date.now();
                        this.upstreamConnection.lastCachedPong = msg;
                        break;
                    case Protocol.MessageHeaders.OPEN_CONNECTION_REPLY_2:
                        const reply2 = new Protocol.OpenConnectionReply2(msg);
                        reply2.decode();

                        const mocked = new Protocol.OpenConnectionReply2();
                        mocked.mtuSize = reply2.mtuSize;
                        mocked.serverGuid = reply2.serverGuid;
                        mocked.clientAddress = [...this.clients.values()][0].getAddress();
                        mocked.encode();
                        this.clients.forEach(client => {
                            // TODO: we should send the right packet to the right client...
                            this.getNetworkUtils().writePacket(mocked.getBuffer(), client);
                        });
                        break
                    default:
                        this.clients.forEach(client => {
                            // TODO: we should send the right packet to the right client...
                            this.getNetworkUtils().writePacket(msg, client);
                        });
                }
            } else if (packetId & Protocol.BitFlags.ACK || packetId & Protocol.BitFlags.NACK) {
                // Forward ACKs and NACKs to the client
                this.clients.forEach(client => {
                    // TODO: we should send the right packet to the right client...
                    this.getNetworkUtils().writePacket(msg, client);
                });
            } else {
                // Forward to client (we can cancel forwardoing sometimes :P, eg. commands)
                // TODO: events with cancellation / packet modification

                const packets = this.getNetworkUtils().readDataPacket(msg);
                if (packets === null) return;
                for (const packet of packets) {
                    // hack for mocked packet
                    this.clients.forEach(client => {
                        // TODO: we should send the right packet to the right client...
                        this.getNetworkUtils().writePacket(packet.toBinary().getBuffer(), client);
                    });
                }
            }
        } else {
            // The packet is from a client, let's do login sequence
            if ((packetId & Protocol.BitFlags.VALID) !== 0) {
                if (packetId & Protocol.BitFlags.ACK || packetId & Protocol.BitFlags.NACK) {
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
                    case Protocol.MessageHeaders.UNCONNECTED_PING:
                        const cachedPong = this.upstreamConnection.lastCachedPong;
                        this.socket.send(cachedPong, 0, cachedPong.length, incomingAddress.getPort(), incomingAddress.getAddress());
                        break;
                    case Protocol.MessageHeaders.OPEN_CONNECTION_REQUEST_1:
                        // Forward the packet to Server
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);

                        // Cache the client connection
                        const token = this.getToken(incomingAddress);
                        if (this.clients.has(token)) {
                            this.logger.error(`Client is already connected from [${token}]`);
                            return;
                        }
                                                    
                        const clientConnection = new DownstreamConnection(incomingAddress, this);
                        this.clients.set(token, clientConnection);
                                                                                
                        this.logger.info(`Client connected from [${token}]`);
                        break;
                    case Protocol.MessageHeaders.OPEN_CONNECTION_REQUEST_2:
                        const request = new Protocol.OpenConnectionRequest2(msg);
                        request.decode();

                        const mocked = new Protocol.OpenConnectionRequest2()
                        mocked.clientGUID = request.clientGUID;
                        mocked.mtuSize = request.mtuSize;
                        mocked.serverAddress = this.upstreamConnection.getAddress();
                        mocked.encode();

                        this.getNetworkUtils().writePacket(mocked.getBuffer(), this.upstreamConnection);
                        break;
                    default:
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                }
            }
        }
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