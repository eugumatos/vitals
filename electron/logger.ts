/**
 * Structured logging via electron-log.
 * Import this module at the top of main.ts (before anything else)
 * to intercept all console.log/error calls automatically.
 */

import log from 'electron-log/main';

log.initialize();

log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

export default log;
