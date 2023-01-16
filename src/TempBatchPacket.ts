import BinaryStream from '@jsprismarine/jsbinaryutils';
import { Protocol } from './jsprismarine/packages/prismarine/src/Prismarine.js';
import Zlib from 'zlib';

export default class TempBatchPacket extends Protocol.Packets.DataPacket {
    public static NetID = 0xfe;

    private payload = Buffer.alloc(0);
    private readonly compressionLevel: number = 7;

    private senderId!: number;
    private clientId!: number;

    public constructor(buffer?: Buffer) {
        super(buffer);
    }

    public decodeHeader(): void {
        const pid = this.readByte();
        if (!pid === this.getId()) {
            throw new Error(`Batch ID mismatch: is ${this.getId()}, got ${pid}`);
        }
    }

    public decodePayload(): void {
        try {
            this.payload = Zlib.inflateRawSync(this.readRemaining(), {
                chunkSize: 1024 * 1024 * 12
            });
        } catch {
            this.payload = Buffer.alloc(0);
        }
    }

    public encodeHeader(): void {
        this.writeByte(this.getId());
    }

    public encodePayload(): void {
        this.write(Zlib.deflateRawSync(this.payload, { level: this.compressionLevel }));
    }

    public addPacket(packet: Protocol.Packets.DataPacket): void {
        if (!packet.getEncoded()) {
            packet.encode();
        }

        const stream = new BinaryStream();
        stream.writeUnsignedVarInt(packet.getBuffer().byteLength);
        stream.write(packet.getBuffer());
        this.payload = Buffer.concat([this.payload, stream.getBuffer()]);
    }

    public getPackets(): Buffer[] {
        const stream = new BinaryStream();
        (stream as any).buffer = this.payload;
        const packets: Buffer[] = [];
        while (!stream.feof()) {
            const length = stream.readUnsignedVarInt();
            const buffer = stream.read(length);

            const packetStream = new BinaryStream(buffer);
            const header = packetStream.readUnsignedVarInt();
            this.senderId = ((header >>> 10) & 3);
            this.clientId = ((header >>> 12) & 3);

            console.log(this.clientId, this.senderId);

            packets.push(buffer);
        }

        return packets;
    }
}