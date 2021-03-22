import InetAddress from '@jsprismarine/raknet/dist/utils/InetAddress';

export default class TempInetAddress extends InetAddress {
    
    public equals(inetAddr: InetAddress): boolean {
        return this.getAddress() === inetAddr.getAddress() && this.getPort() === inetAddr.getPort();
    }
}