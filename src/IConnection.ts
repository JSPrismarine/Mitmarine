import InetAddress from '@jsprismarine/prismarine/dist/src/network/raknet/utils/InetAddress';

export default interface IConnection {
    getAddress(): InetAddress;
}