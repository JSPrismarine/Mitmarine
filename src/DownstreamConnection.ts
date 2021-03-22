import IConnection from './IConnection';
import InetAddress from '@jsprismarine/raknet/dist/utils/InetAddress';
import ProxyServer from './ProxyServer';

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