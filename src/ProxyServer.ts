import Dgram, { RemoteInfo, Socket } from 'dgram';

import BitFlags from '@jsprismarine/prismarine/dist/src/network/raknet/protocol/BitFlags';
import ConfigBuilder from '@jsprismarine/prismarine/dist/src/config/ConfigBuilder';
import DownstreamConnection from './DownstreamConnection';
import InetAddress from '@jsprismarine/prismarine/dist/src/network/raknet/utils/InetAddress';
import LoggerBuilder from '@jsprismarine/prismarine/dist/src/utils/Logger';
import NetworkUtils from './NetworkUtils';
import RakNetIdentifiers from '@jsprismarine/prismarine/dist/src/network/raknet/protocol/Identifiers';
import UpstreamConnection from './UpstreamConnection';

export default class ProxyServer {
    private socket: Socket = Dgram.createSocket('udp4');

    private upstreamConnection: UpstreamConnection;
    private downstreamConnection!: DownstreamConnection

    private targetAddress: InetAddress;
    private clientAddress!: InetAddress;

    private networkUtils: NetworkUtils;
    private logger: LoggerBuilder;

    public constructor(config: ConfigBuilder, logger: LoggerBuilder) {
        this.logger = logger;
        
        const bindAddress: string = config.get('bindAddress', '0.0.0.0');
        const bindPort: number = config.get('bindPort', 19132);
        this.socket.bind(bindPort, bindAddress);
        
        const targetAddress: string = config.get('targetAddress', '165.232.37.93');
        const targetPort: number = config.get('targetPort', 19132);
        /* 
        NOT WORKING
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
        this.targetAddress = new InetAddress(targetAddress, targetPort);
        
        // Proxy -> Server
        this.upstreamConnection = new UpstreamConnection(this.targetAddress, this);

        this.networkUtils = new NetworkUtils(this);

        this.handleNetworking();
    }

    private handleNetworking() {
        this.socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
            const address = new InetAddress(rinfo.address, rinfo.port);
            
            // If needs to handle offline packets
            if (!this.upstreamConnection.isConnected()) {
                switch (msg[0]) {
                    case RakNetIdentifiers.UnconnectedPing:
                        this.clientAddress = address;
                        
                        // Forward the packet to Server
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                        break;
                    case RakNetIdentifiers.UnconnectedPong:
                        const data = msg.slice(40).toString().split(';');
                        this.logger.info(`§eServer found: ${data[0]}, MCBE v${data[2]} (${data[3]} players online)`);
                        
                        // Forward the packet to Client
                        this.socket.send(msg, 0, msg.length, this.clientAddress.getPort(), this.clientAddress.getAddress());
                        break;
                    case RakNetIdentifiers.OpenConnectionRequest1:
                        this.logger.info(`Client connected from [${rinfo.address}:${rinfo.port}]`);
                        this.downstreamConnection = new DownstreamConnection(address, this);
                        this.upstreamConnection.setConnected();  // Stop listening for offline packets

                        // Forward the packet to Server
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                        break;
                }    
            } else {
                // TODO: InetAddress.equals(InetAddress) -> bool
                if (address.getAddress() == this.upstreamConnection.getAddress().getAddress() && address.getPort() == this.upstreamConnection.getAddress().getPort()) {
                    // Server -> Proxy
                    this.getNetworkUtils().writePacket(msg, this.downstreamConnection);  // Forward to client (we can cancel forwardoing sometimes :P, eg. commands)
                    const packet = this.getNetworkUtils().readDataPacket(msg);
                } else if (address.getAddress() == this.downstreamConnection.getAddress().getAddress() && address.getPort() == this.downstreamConnection.getAddress().getPort()) {
                    // Client -> Proxy
                    const pid = msg[0];
                    if ((pid & BitFlags.VALID) !== 0) {
                        if (pid & BitFlags.ACK || pid & BitFlags.NACK) {
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
                        // Forward the last offline packets needed
                        this.getNetworkUtils().writePacket(msg, this.upstreamConnection);
                    }
                }
            }
        });
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