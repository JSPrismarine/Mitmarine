import { Protocol } from './jsprismarine/packages/prismarine/src/Prismarine.js';

export default class TempLevelChunkPacket extends Protocol.Packets.LevelChunkPacket {
    
    public decodePayload() {
        this.chunkX = this.readVarInt();
        this.chunkZ = this.readVarInt();
        this.subChunkCount = this.readUnsignedVarInt();
        this.readBoolean();  // Don't care
        const len = this.readUnsignedVarInt();
        this.read(len);
    }
    
}