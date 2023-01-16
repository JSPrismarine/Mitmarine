import IConnection from './IConnection.js';
import { InetAddress } from './jsprismarine/packages/raknet/src/RakNet.js';
import ProxyServer from './ProxyServer.js';

export default class DownstreamConnection implements IConnection {
    private address: InetAddress;
    private server: ProxyServer;

    public constructor(address: InetAddress, server: ProxyServer) {
        this.address = address;
        this.server = server;
    }

    public getAddress(): InetAddress {
        return this.address;
    }
}