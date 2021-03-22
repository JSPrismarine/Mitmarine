import InetAddress from '@jsprismarine/raknet/dist/utils/InetAddress';

export default interface IConnection {
    getAddress(): InetAddress;
}