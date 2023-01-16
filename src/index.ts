import * as path from "path";

import { ConfigBuilder, Logger as LoggerBuilder } from './jsprismarine/packages/prismarine/src/Prismarine.js';
import ProxyServer from './ProxyServer.js';

const config = new ConfigBuilder(path.join(process.cwd(), 'proxy-config.yaml'));
const logger = new LoggerBuilder();
new ProxyServer(config, logger);

