'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
const moment_1 = tslib_1.__importDefault(require("moment"));
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const util_1 = tslib_1.__importDefault(require("util"));
const events_1 = require("events");
const staticFrequency = ['daily', 'test', 'm', 'h', 'custom'];
const DATE_FORMAT = 'YYYYMMDDHHmm';
const _checkNumAndType = function (type, num) {
    if (typeof num === 'number') {
        switch (type) {
            case 'm':
                if (num < 0 || num > 60) {
                    return false;
                }
                break;
            case 'h':
                if (num < 0 || num > 24) {
                    return false;
                }
                break;
        }
        return { type, digit: num };
    }
};
const _checkDailyAndTest = function (freqType) {
    switch (freqType) {
        case 'custom':
        case 'daily':
            return { type: freqType, digit: undefined };
        case 'test':
            return { type: freqType, digit: 0 };
    }
    return false;
};
const getFrequency = function (frequency) {
    const _f = frequency.toLowerCase().match(/^(\d+)([mh])$/);
    if (_f) {
        return _checkNumAndType(_f[2], parseInt(_f[1]));
    }
    const dailyOrTest = _checkDailyAndTest(frequency);
    if (dailyOrTest) {
        return dailyOrTest;
    }
    return false;
};
const parseFileSize = function (size) {
    if (size && typeof size === 'string') {
        const _s = size.toLowerCase().match(/^((?:0\.)?\d+)([kmg])$/);
        if (_s) {
            switch (_s[2]) {
                case 'k':
                    return Number(_s[1]) * 1024;
                case 'm':
                    return Number(_s[1]) * 1024 * 1024;
                case 'g':
                    return Number(_s[1]) * 1024 * 1024 * 1024;
            }
        }
    }
    return null;
};
const getDate = function (format, date_format, utc) {
    date_format = date_format || DATE_FORMAT;
    const currentMoment = utc ? moment_1.default.utc() : moment_1.default().local();
    if (format && staticFrequency.indexOf(format.type) !== -1) {
        switch (format.type) {
            case 'm': {
                const minute = Math.floor(currentMoment.minutes() / format.digit) * format.digit;
                return currentMoment.minutes(minute).format(date_format);
            }
            case 'h': {
                const hour = Math.floor(currentMoment.hour() / format.digit) * format.digit;
                return currentMoment.hour(hour).format(date_format);
            }
            case 'daily':
            case 'custom':
            case 'test':
                return currentMoment.format(date_format);
        }
    }
    return currentMoment.format(date_format);
};
const setAuditLog = function (max_logs, audit_file, log_file) {
    let _rtn = null;
    if (max_logs) {
        const use_days = max_logs.toString().substr(-1);
        const _num = max_logs.toString().match(/^(\d+)/);
        if (Number(_num[1]) > 0) {
            const baseLog = path_1.default.dirname(log_file.replace(/%DATE%.+/, '_filename'));
            try {
                let full_path = '';
                if (audit_file) {
                    full_path = path_1.default.resolve(audit_file);
                    _rtn = JSON.parse(fs_1.default.readFileSync(full_path, { encoding: 'utf-8' }));
                }
                else {
                    full_path = path_1.default.resolve(`${baseLog}/` + '.audit.json');
                    _rtn = JSON.parse(fs_1.default.readFileSync(full_path, { encoding: 'utf-8' }));
                }
            }
            catch (e) {
                if (e.code !== 'ENOENT') {
                    return null;
                }
                _rtn = {
                    keep: {
                        days: false,
                        amount: Number(_num[1]),
                    },
                    auditLog: audit_file || `${baseLog}/` + '.audit.json',
                    files: [],
                };
            }
            _rtn.keep = {
                days: use_days === 'd',
                amount: Number(_num[1]),
            };
        }
    }
    return _rtn;
};
const writeAuditLog = function (audit, verbose) {
    try {
        mkDirForFile(String(audit.auditLog));
        fs_1.default.writeFileSync(audit.auditLog, JSON.stringify(audit, null, 4));
    }
    catch (e) {
        if (verbose) {
            console.error(new Date(), '[FileStreamRotator] Failed to store log audit at:', audit.auditLog, 'Error:', e);
        }
    }
};
function removeFile(file, verbose) {
    if (file.hash === crypto_1.default.createHash('md5').update(`${file.name}LOG_FILE${file.date}`).digest('hex')) {
        try {
            if (fs_1.default.existsSync(file.name)) {
                fs_1.default.unlinkSync(file.name);
            }
        }
        catch (e) {
            if (verbose) {
                console.error(new Date(), '[FileStreamRotator] Could not remove old log file: ', file.name);
            }
        }
    }
}
function createCurrentSymLink(logfile, name, verbose) {
    const symLinkName = name || 'current.log';
    const logPath = path_1.default.dirname(logfile);
    const logfileName = path_1.default.basename(logfile);
    const current = `${logPath}/${symLinkName}`;
    try {
        const stats = fs_1.default.lstatSync(current);
        if (stats.isSymbolicLink()) {
            fs_1.default.unlinkSync(current);
            fs_1.default.symlinkSync(logfileName, current);
        }
    }
    catch (err) {
        if (err && err.code === 'ENOENT') {
            try {
                fs_1.default.symlinkSync(logfileName, current);
            }
            catch (e) {
                if (verbose) {
                    console.error(new Date(), '[FileStreamRotator] Could not create symlink file: ', current, ' -> ', logfileName);
                }
            }
        }
    }
}
function createLogWatcher(logfile, verbose, cb) {
    if (!logfile) {
        return null;
    }
    try {
        const stats = fs_1.default.lstatSync(logfile);
        return fs_1.default.watch(logfile, (event, filename) => {
            if (event === 'rename') {
                try {
                    const _stats = fs_1.default.lstatSync(logfile);
                }
                catch (err) {
                    cb(err, logfile);
                }
            }
        });
    }
    catch (err) {
        if (verbose) {
            console.log(new Date(), `[FileStreamRotator] Could not add watcher for ${logfile}`);
        }
    }
}
const addLogToAudit = function (logfile, audit, stream, verbose) {
    if (audit && audit.files) {
        const index = audit.files.findIndex((file) => file.name === logfile);
        if (index !== -1) {
            return audit;
        }
        const time = Date.now();
        audit.files.push({
            date: time,
            name: logfile,
            hash: crypto_1.default.createHash('md5').update(`${logfile}LOG_FILE${time}`).digest('hex'),
        });
        if (audit.keep.days) {
            const oldestDate = moment_1.default().subtract(audit.keep.amount, 'days').valueOf();
            const recentFiles = audit.files.filter((file) => {
                if (file.date > oldestDate) {
                    return true;
                }
                removeFile(file, verbose);
                stream.emit('logRemoved', file);
                return false;
            });
            audit.files = recentFiles;
        }
        else {
            const filesToKeep = audit.files.splice(-audit.keep.amount);
            if (audit.files.length > 0) {
                audit.files.filter((file) => {
                    removeFile(file, verbose);
                    stream.emit('logRemoved', file);
                    return false;
                });
            }
            audit.files = filesToKeep;
        }
        writeAuditLog(audit, verbose);
    }
    return audit;
};
const getStream = function (options) {
    let frequencyMetaData = null;
    let curDate = null;
    const self = this;
    if (!options.filename) {
        console.error(new Date(), '[FileStreamRotator] No filename supplied. Defaulting to STDOUT');
        return process.stdout;
    }
    if (options.frequency) {
        frequencyMetaData = self.getFrequency(options.frequency);
    }
    const auditLog = self.setAuditLog(options.max_logs, options.audit_file, options.filename);
    self.verbose = options.verbose !== undefined ? options.verbose : true;
    let fileSize = null;
    let fileCount = 0;
    let curSize = 0;
    if (options.size) {
        fileSize = parseFileSize(options.size);
    }
    let dateFormat = options.date_format || DATE_FORMAT;
    if (frequencyMetaData && frequencyMetaData.type === 'daily') {
        if (!options.date_format) {
            dateFormat = 'YYYY-MM-DD';
        }
        if (moment_1.default().format(dateFormat) !== moment_1.default().endOf('day').format(dateFormat) || moment_1.default().format(dateFormat) === moment_1.default().add(1, 'day').format(dateFormat)) {
            if (self.verbose) {
                console.log(new Date(), '[FileStreamRotator] Changing type to custom as date format changes more often than once a day or not every day');
            }
            frequencyMetaData.type = 'custom';
        }
    }
    if (frequencyMetaData) {
        curDate = options.frequency ? self.getDate(frequencyMetaData, dateFormat, options.utc) : '';
    }
    options.create_symlink = options.create_symlink || false;
    options.extension = options.extension || '';
    const filename = options.filename;
    let oldFile = null;
    let logfile = filename + (curDate ? `.${curDate}` : '');
    if (filename.match(/%DATE%/)) {
        logfile = filename.replace(/%DATE%/g, curDate ? curDate : self.getDate(null, dateFormat, options.utc));
    }
    if (fileSize) {
        let lastLogFile = null;
        let t_log = logfile;
        let f = null;
        if (auditLog && auditLog.files && auditLog.files instanceof Array && auditLog.files.length > 0) {
            const lastEntry = auditLog.files[auditLog.files.length - 1].name;
            if (lastEntry.match(t_log)) {
                const lastCount = lastEntry.match(`${t_log}\\.(\\d+)`);
                if (lastCount) {
                    t_log = lastEntry;
                    fileCount = lastCount[1];
                }
            }
        }
        if (fileCount === 0 && t_log === logfile) {
            t_log += options.extension;
        }
        while (f = fs_1.default.existsSync(t_log)) {
            lastLogFile = t_log;
            fileCount++;
            t_log = `${logfile}.${fileCount}${options.extension}`;
        }
        if (lastLogFile) {
            const lastLogFileStats = fs_1.default.statSync(lastLogFile);
            if (lastLogFileStats.size < fileSize) {
                t_log = lastLogFile;
                fileCount--;
                curSize = lastLogFileStats.size;
            }
        }
        logfile = t_log;
    }
    else {
        logfile += options.extension;
    }
    if (self.verbose) {
        console.log(new Date(), '[FileStreamRotator] Logging to: ', logfile);
    }
    mkDirForFile(logfile);
    const file_options = options.file_options || { flags: 'a' };
    let rotateStream = fs_1.default.createWriteStream(logfile, file_options);
    if (curDate && frequencyMetaData && staticFrequency.indexOf(frequencyMetaData.type) > -1 || fileSize > 0) {
        if (self.verbose) {
            console.log(new Date(), '[FileStreamRotator] Rotating file: ', frequencyMetaData ? frequencyMetaData.type : '', fileSize ? `size: ${fileSize}` : '');
        }
        const stream = new events_1.EventEmitter();
        stream.auditLog = auditLog;
        stream.end = function () {
            rotateStream.end.apply(rotateStream, arguments);
        };
        BubbleEvents(rotateStream, stream);
        stream.on('close', () => {
            if (logWatcher) {
                logWatcher.close();
            }
        });
        stream.on('new', (newLog) => {
            stream.auditLog = self.addLogToAudit(newLog, stream.auditLog, stream, self.verbose);
            if (options.create_symlink) {
                createCurrentSymLink(newLog, options.symlink_name, self.verbose);
            }
            if (options.watch_log) {
                stream.emit('addWatcher', newLog);
            }
        });
        let logWatcher;
        stream.on('addWatcher', (newLog) => {
            if (logWatcher) {
                logWatcher.close();
            }
            if (!options.watch_log) {
                return;
            }
            logWatcher = createLogWatcher(newLog, self.verbose, (err, _newLog) => {
                stream.emit('createLog', _newLog);
            });
        });
        stream.on('createLog', (file) => {
            try {
                const stats = fs_1.default.lstatSync(file);
            }
            catch (err) {
                if (rotateStream && typeof rotateStream.end === 'function') {
                    rotateStream.end();
                }
                rotateStream = fs_1.default.createWriteStream(file, file_options);
                BubbleEvents(rotateStream, stream);
            }
        });
        stream.write = function (str, encoding) {
            const newDate = this.getDate(frequencyMetaData, dateFormat, options.utc);
            if (newDate !== curDate || fileSize && curSize > fileSize) {
                let newLogfile = filename + (curDate ? `.${newDate}` : '');
                if (filename.match(/%DATE%/) && curDate) {
                    newLogfile = filename.replace(/%DATE%/g, newDate);
                }
                if (fileSize && curSize > fileSize) {
                    fileCount++;
                    newLogfile += `.${fileCount}${options.extension}`;
                }
                else {
                    fileCount = 0;
                    newLogfile += options.extension;
                }
                curSize = 0;
                if (self.verbose) {
                    console.log(new Date(), util_1.default.format('[FileStreamRotator] Changing logs from %s to %s', logfile, newLogfile));
                }
                curDate = newDate;
                oldFile = logfile;
                logfile = newLogfile;
                if (options.end_stream === true) {
                    rotateStream.end();
                }
                else {
                    rotateStream.destroy();
                }
                mkDirForFile(logfile);
                rotateStream = fs_1.default.createWriteStream(newLogfile, file_options);
                stream.emit('new', newLogfile);
                stream.emit('rotate', oldFile, newLogfile);
                BubbleEvents(rotateStream, stream);
            }
            rotateStream.write(str, encoding);
            curSize += Buffer.byteLength(str, encoding);
        }.bind(this);
        process.nextTick(() => {
            stream.emit('new', logfile);
        });
        stream.emit('new', logfile);
        return stream;
    }
    else {
        if (self.verbose) {
            console.log(new Date(), '[FileStreamRotator] File won\'t be rotated: ', options.frequency, options.size);
        }
        process.nextTick(() => {
            rotateStream.emit('new', logfile);
        });
        return rotateStream;
    }
};
const mkDirForFile = function (pathWithFile) {
    const _path = path_1.default.dirname(pathWithFile);
    _path.split(path_1.default.sep).reduce((fullPath, folder) => {
        fullPath += folder + path_1.default.sep;
        if (!fs_1.default.existsSync(fullPath)) {
            fs_1.default.mkdirSync(fullPath);
        }
        return fullPath;
    }, '');
};
const BubbleEvents = function BubbleEvents(emitter, proxy) {
    emitter.on('close', () => {
        proxy.emit('close');
    });
    emitter.on('finish', () => {
        proxy.emit('finish');
    });
    emitter.on('error', (err) => {
        proxy.emit('error', err);
    });
    emitter.on('open', (fd) => {
        proxy.emit('open', fd);
    });
};
const FileStreamRotator = {
    getFrequency,
    parseFileSize,
    getDate,
    setAuditLog,
    writeAuditLog,
    addLogToAudit,
    getStream,
};
module.exports = FileStreamRotator;
exports.default = FileStreamRotator;
