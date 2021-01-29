import IConnection from './IConnection';
import InetAddress from '@jsprismarine/prismarine/dist/src/network/raknet/utils/InetAddress';
import ProxyServer from './ProxyServer';

export default class UpstreamConnection implements IConnection {
    private address: InetAddress;
    private server: ProxyServer;
    // For connected mean handled offline packets
    private connected: boolean = false;

    public constructor(address: InetAddress, server: ProxyServer) {
        this.address = address;
        this.server = server;
    }

    public setConnected(val: boolean = true): void {
        this.connected = val;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getAddress(): InetAddress {
        return this.address;
    }
}