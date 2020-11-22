'use strict'

/* !
 * FileStreamRotator
 * Copyright(c) 2012-2017 Holiday Extras.
 * Copyright(c) 2017 Roger C.
 * MIT Licensed
 */

/**
 * Module dependencies.
 */
import fs from 'fs'
import path from 'path'
import moment from 'moment'
import crypto from 'crypto'
import util from 'util'

import events, { EventEmitter } from 'events'
import { URL } from 'url'

const staticFrequency = ['daily', 'test', 'm', 'h', 'custom']
const DATE_FORMAT = 'YYYYMMDDHHmm'

/**
 * Returns frequency metadata for minute/hour rotation
 * @param type
 * @param num
 * @returns {*}
 * @private
 */
const _checkNumAndType = function (type: any, num: number) {
    if (typeof num === 'number') {
        switch (type) {
            case 'm':
                if (num < 0 || num > 60) {
                    return false
                }
                break
            case 'h':
                if (num < 0 || num > 24) {
                    return false
                }
                break
        }
        return { type, digit: num }
    }
}

/**
 * Returns frequency metadata for defined frequency
 * @param freqType
 * @returns {*}
 * @private
 */
const _checkDailyAndTest = function (freqType: any) {
    switch (freqType) {
        case 'custom':
        case 'daily':
            return { type: freqType, digit: undefined }
        case 'test':
            return { type: freqType, digit: 0 }
    }
    return false
}

/**
 * Returns frequency metadata
 * @param frequency
 * @returns {*}
 */
const getFrequency = function (frequency: string) {
    const _f = frequency.toLowerCase().match(/^(\d+)([mh])$/)
    if (_f) {
        return _checkNumAndType(_f[2], parseInt(_f[1]))
    }

    const dailyOrTest = _checkDailyAndTest(frequency)
    if (dailyOrTest) {
        return dailyOrTest
    }

    return false
}

/**
 * Returns a number based on the option string
 * @param size
 * @returns {Number}
 */
const parseFileSize = function (size: string): number {
    if (size && typeof size === 'string') {
        const _s = size.toLowerCase().match(/^((?:0\.)?\d+)([kmg])$/)
        if (_s) {
            switch (_s[2]) {
                case 'k':
                    return Number(_s[1]) * 1024
                case 'm':
                    return Number(_s[1]) * 1024 * 1024
                case 'g':
                    return Number(_s[1]) * 1024 * 1024 * 1024
            }
        }
    }
    return null
}

/**
 * Returns date string for a given format / date_format
 * @param format
 * @param date_format
 * @param {boolean} utc
 * @returns {string}
 */
const getDate = function (format: { type: string, digit: number }, date_format: string, utc: boolean) {
    date_format = date_format || DATE_FORMAT
    const currentMoment = utc ? moment.utc() : moment().local()
    if (format && staticFrequency.indexOf(format.type) !== -1) {
        switch (format.type) {
            case 'm': {
                const minute = Math.floor(currentMoment.minutes() / format.digit) * format.digit
                return currentMoment.minutes(minute).format(date_format)
            }
            case 'h': {
                const hour = Math.floor(currentMoment.hour() / format.digit) * format.digit
                return currentMoment.hour(hour).format(date_format)
            }
            case 'daily':
            case 'custom':
            case 'test':
                return currentMoment.format(date_format)
        }
    }
    return currentMoment.format(date_format)
}

/**
 * Read audit json object from disk or return new object or null
 * @param max_logs
 * @param audit_file
 * @param log_file
 * @returns {Object} auditLogSettings
 * @property {Object} auditLogSettings.keep
 * @property {Boolean} auditLogSettings.keep.days
 * @property {Number} auditLogSettings.keep.amount
 * @property {String} auditLogSettings.auditLog
 * @property {Array} auditLogSettings.files
 */
const setAuditLog = function (max_logs: { toString: () => string }, audit_file: string, log_file: string) {
    let _rtn = null
    if (max_logs) {
        const use_days = max_logs.toString().substr(-1)
        const _num = max_logs.toString().match(/^(\d+)/)

        if (Number(_num[1]) > 0) {
            const baseLog = path.dirname(log_file.replace(/%DATE%.+/, '_filename'))
            try {
                let full_path = ''
                if (audit_file) {
                    full_path = path.resolve(audit_file)
                    _rtn = JSON.parse(fs.readFileSync(full_path, { encoding: 'utf-8' }))
                } else {
                    full_path = path.resolve(`${baseLog}/` + '.audit.json')
                    _rtn = JSON.parse(fs.readFileSync(full_path, { encoding: 'utf-8' }))
                }
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    return null
                }
                _rtn = {
                    keep: {
                        days: false,
                        amount: Number(_num[1]),
                    },
                    auditLog: audit_file || `${baseLog}/` + '.audit.json',
                    files: [],
                }
            }

            _rtn.keep = {
                days: use_days === 'd',
                amount: Number(_num[1]),
            }

        }
    }
    return _rtn
}

/**
 * Write audit json object to disk
 * @param {Object} audit
 * @param {Object} audit.keep
 * @param {Boolean} audit.keep.days
 * @param {Number} audit.keep.amount
 * @param {String} audit.auditLog
 * @param {Array} audit.files
 * @param {Boolean} verbose
 */
const writeAuditLog = function (audit: { auditLog: string | number | Buffer | URL }, verbose: any) {
    try {
        mkDirForFile(String(audit.auditLog))
        fs.writeFileSync(audit.auditLog, JSON.stringify(audit, null, 4))
    } catch (e) {
        if (verbose) {
            console.error(new Date(), '[FileStreamRotator] Failed to store log audit at:', audit.auditLog, 'Error:', e)
        }
    }
}

/**
 * Removes old log file
 * @param file
 * @param file.hash
 * @param file.name
 * @param file.date
 * @param {Boolean} verbose
 */
function removeFile(file: { hash: string, name: fs.PathLike, date: any }, verbose: any) {
    if (file.hash === crypto.createHash('md5').update(`${file.name}LOG_FILE${file.date}`).digest('hex')) {
        try {
            if (fs.existsSync(file.name)) {
                fs.unlinkSync(file.name)
            }
        } catch (e) {
            if (verbose) {
                console.error(new Date(), '[FileStreamRotator] Could not remove old log file: ', file.name)
            }
        }
    }
}

/**
 * Create symbolic link to current log file
 * @param {String} logfile
 * @param {String} name Name to use for symbolic link
 * @param {Boolean} verbose
 */
function createCurrentSymLink(logfile: string, name: string, verbose: any) {
    const symLinkName = name || 'current.log'
    const logPath = path.dirname(logfile)
    const logfileName = path.basename(logfile)
    const current = `${logPath}/${symLinkName}`
    try {
        const stats = fs.lstatSync(current)
        if (stats.isSymbolicLink()) {
            fs.unlinkSync(current)
            fs.symlinkSync(logfileName, current)
        }
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            try {
                fs.symlinkSync(logfileName, current)
            } catch (e) {
                if (verbose) {
                    console.error(new Date(), '[FileStreamRotator] Could not create symlink file: ', current, ' -> ', logfileName)
                }
            }
        }
    }
}

/**
 *
 * @param {String} logfile
 * @param {Boolean} verbose
 * @param {function} cb
 */
function createLogWatcher(logfile: fs.PathLike, verbose: any, cb: { (err: any, newLog: any): void, (arg0: any, arg1: any): void }) {
    if (!logfile) {
        return null
    }
    // console.log("Creating log watcher")
    try {
        const stats = fs.lstatSync(logfile)
        return fs.watch(logfile, (event: string, filename: any) => {
            // console.log(Date(), event, filename)
            if (event === 'rename') {
                try {
                    const _stats = fs.lstatSync(logfile)
                    // console.log("STATS:", stats)
                } catch (err) {
                    // console.log("ERROR:", err)
                    cb(err, logfile)
                }
            }
        })
    } catch (err) {
        if (verbose) {
            console.log(new Date(), `[FileStreamRotator] Could not add watcher for ${logfile}`)
        }
    }
}

/**
 * Write audit json object to disk
 * @param {String} logfile
 * @param {Object} audit
 * @param {Object} audit.keep
 * @param {Boolean} audit.keep.days
 * @param {Number} audit.keep.amount
 * @param {String} audit.auditLog
 * @param {Array} audit.files
 * @param {EventEmitter} stream
 * @param {Boolean} verbose
 */
const addLogToAudit = function (logfile: any, audit: { files: { date: number, name: any, hash: string }[], auditLog: string, keep: { days: any, amount: moment.DurationInputArg1 } }, stream: { emit: (arg0: string, arg1: any) => void }, verbose: any) {
    if (audit && audit.files) {
        // Based on contribution by @nickbug - https://github.com/nickbug
        const index = audit.files.findIndex((file: { name: any }) => file.name === logfile)
        if (index !== -1) {
            // nothing to do as entry already exists.
            return audit
        }
        const time = Date.now()
        audit.files.push({
            date: time,
            name: logfile,
            hash: crypto.createHash('md5').update(`${logfile}LOG_FILE${time}`).digest('hex'),
        })

        if (audit.keep.days) {
            const oldestDate = moment().subtract(audit.keep.amount, 'days').valueOf()
            const recentFiles = audit.files.filter((file: { date: number, hash: string, name: any }) => {
                if (file.date > oldestDate) {
                    return true
                }
                removeFile(file, verbose)
                stream.emit('logRemoved', file)
                return false
            })
            audit.files = recentFiles
        } else {
            const filesToKeep = audit.files.splice(-audit.keep.amount)
            if (audit.files.length > 0) {
                audit.files.filter((file: any) => {
                    removeFile(file, verbose)
                    stream.emit('logRemoved', file)
                    return false
                })
            }
            audit.files = filesToKeep
        }
        writeAuditLog(audit, verbose)
    }

    return audit
}

/**
 *
 * @param options
 * @param options.filename
 * @param options.frequency
 * @param options.verbose
 * @param options.date_format
 * @param options.size
 * @param options.max_logs
 * @param options.audit_file
 * @param options.file_options
 * @param options.utc
 * @param options.extension File extension to be added at the end of the filename
 * @param options.watch_log
 * @param options.create_symlink
 * @param options.symlink_name
 * @returns {Object} stream
 */
const getStream = function (options: { filename: string, frequency: string, max_logs: any, audit_file: any, verbose: boolean, size: string, date_format: string, utc: boolean, create_symlink: boolean, extension: string, file_options: { flags: string }, symlink_name: any, watch_log: any, end_stream: boolean }) {
    let frequencyMetaData: { type: string } = null
    let curDate: any = null
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    if (!options.filename) {
        console.error(new Date(), '[FileStreamRotator] No filename supplied. Defaulting to STDOUT')
        return process.stdout
    }

    if (options.frequency) {
        frequencyMetaData = self.getFrequency(options.frequency)
    }

    const auditLog = self.setAuditLog(options.max_logs, options.audit_file, options.filename)
    self.verbose = options.verbose !== undefined ? options.verbose : true

    let fileSize: number = null
    let fileCount = 0
    let curSize = 0
    if (options.size) {
        fileSize = parseFileSize(options.size)
    }

    let dateFormat = options.date_format || DATE_FORMAT
    if (frequencyMetaData && frequencyMetaData.type === 'daily') {
        if (!options.date_format) {
            dateFormat = 'YYYY-MM-DD'
        }
        if (moment().format(dateFormat) !== moment().endOf('day').format(dateFormat) || moment().format(dateFormat) === moment().add(1, 'day').format(dateFormat)) {
            if (self.verbose) {
                console.log(new Date(), '[FileStreamRotator] Changing type to custom as date format changes more often than once a day or not every day')
            }
            frequencyMetaData.type = 'custom'
        }
    }

    if (frequencyMetaData) {
        curDate = options.frequency ? self.getDate(frequencyMetaData, dateFormat, options.utc) : ''
    }

    options.create_symlink = options.create_symlink || false
    options.extension = options.extension || ''
    const filename = options.filename
    let oldFile = null
    let logfile = filename + (curDate ? `.${curDate}` : '')
    if (filename.match(/%DATE%/)) {
        logfile = filename.replace(/%DATE%/g, curDate ? curDate : self.getDate(null, dateFormat, options.utc))
    }

    if (fileSize) {
        let lastLogFile = null
        let t_log = logfile
        let f = null
        if (auditLog && auditLog.files && auditLog.files instanceof Array && auditLog.files.length > 0) {
            const lastEntry = auditLog.files[auditLog.files.length - 1].name
            if (lastEntry.match(t_log)) {
                const lastCount = lastEntry.match(`${t_log}\\.(\\d+)`)
                // Thanks for the PR contribution from @andrefarzat - https://github.com/andrefarzat
                if (lastCount) {
                    t_log = lastEntry
                    fileCount = lastCount[1]
                }
            }
        }

        if (fileCount === 0 && t_log === logfile) {
            t_log += options.extension
        }

        // eslint-disable-next-line no-cond-assign
        while (f = fs.existsSync(t_log)) {
            lastLogFile = t_log
            fileCount++
            t_log = `${logfile}.${fileCount}${options.extension}`
        }
        if (lastLogFile) {
            const lastLogFileStats = fs.statSync(lastLogFile)
            if (lastLogFileStats.size < fileSize) {
                t_log = lastLogFile
                fileCount--
                curSize = lastLogFileStats.size
            }
        }
        logfile = t_log
    } else {
        logfile += options.extension
    }

    if (self.verbose) {
        console.log(new Date(), '[FileStreamRotator] Logging to: ', logfile)
    }

    mkDirForFile(logfile)

    const file_options = options.file_options || { flags: 'a' }
    let rotateStream = fs.createWriteStream(logfile, file_options)
    if (curDate && frequencyMetaData && staticFrequency.indexOf(frequencyMetaData.type) > -1 || fileSize > 0) {
        if (self.verbose) {
            console.log(new Date(), '[FileStreamRotator] Rotating file: ', frequencyMetaData ? frequencyMetaData.type : '', fileSize ? `size: ${fileSize}` : '')
        }
        type StreamEventEmitter = EventEmitter & {
            auditLog?: any
            end?: () => any
            write?: (str: string | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array | DataView | ArrayBuffer | SharedArrayBuffer, encoding: BufferEncoding) => any
        }
        const stream: StreamEventEmitter = new EventEmitter()
        stream.auditLog = auditLog
        stream.end = function () {
            // eslint-disable-next-line prefer-spread,prefer-rest-params
            rotateStream.end.apply(rotateStream, arguments)
        }
        BubbleEvents(rotateStream, stream)

        stream.on('close', () => {
            if (logWatcher) {
                logWatcher.close()
            }
        })

        stream.on('new', (newLog: any) => {
            // console.log("new log", newLog)
            stream.auditLog = self.addLogToAudit(newLog, stream.auditLog, stream, self.verbose)
            if (options.create_symlink) {
                createCurrentSymLink(newLog, options.symlink_name, self.verbose)
            }
            if (options.watch_log) {
                stream.emit('addWatcher', newLog)
            }
        })

        let logWatcher: fs.FSWatcher
        stream.on('addWatcher', (newLog: any) => {
            if (logWatcher) {
                logWatcher.close()
            }
            if (!options.watch_log) {
                return
            }
            // console.log("ADDING WATCHER", newLog)
            logWatcher = createLogWatcher(newLog, self.verbose, (err: any, _newLog: any) => {
                stream.emit('createLog', _newLog)
            })
        })

        stream.on('createLog', (file: fs.PathLike) => {
            try {
                const stats = fs.lstatSync(file)
            } catch (err) {
                if (rotateStream && typeof rotateStream.end === 'function') {
                    rotateStream.end()
                }
                rotateStream = fs.createWriteStream(file, file_options)
                BubbleEvents(rotateStream, stream)
            }
        })

        type BufferEncoding = 'ascii' | 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'latin1' | 'binary' | 'hex'

        stream.write = function (str: string | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array | DataView | ArrayBuffer | SharedArrayBuffer, encoding: BufferEncoding) {
            const newDate = this.getDate(frequencyMetaData, dateFormat, options.utc)
            if (newDate !== curDate || fileSize && curSize > fileSize) {
                let newLogfile = filename + (curDate ? `.${newDate}` : '')
                if (filename.match(/%DATE%/) && curDate) {
                    newLogfile = filename.replace(/%DATE%/g, newDate)
                }

                if (fileSize && curSize > fileSize) {
                    fileCount++
                    newLogfile += `.${fileCount}${options.extension}`
                } else {
                    // reset file count
                    fileCount = 0
                    newLogfile += options.extension
                }
                curSize = 0

                if (self.verbose) {
                    console.log(new Date(), util.format('[FileStreamRotator] Changing logs from %s to %s', logfile, newLogfile))
                }
                curDate = newDate
                oldFile = logfile
                logfile = newLogfile
                // Thanks to @mattberther https://github.com/mattberther for raising it again.
                if (options.end_stream === true) {
                    rotateStream.end()
                } else {
                    rotateStream.destroy()
                }

                mkDirForFile(logfile)

                rotateStream = fs.createWriteStream(newLogfile, file_options)
                stream.emit('new', newLogfile)
                stream.emit('rotate', oldFile, newLogfile)
                BubbleEvents(rotateStream, stream)
            }
            rotateStream.write(str, encoding)
            // Handle length of double-byte characters
            curSize += Buffer.byteLength(str, encoding)
        }.bind(this)
        process.nextTick(() => {
            stream.emit('new', logfile)
        })
        stream.emit('new', logfile)
        return stream
    } else {
        if (self.verbose) {
            console.log(new Date(), '[FileStreamRotator] File won\'t be rotated: ', options.frequency, options.size)
        }
        process.nextTick(() => {
            rotateStream.emit('new', logfile)
        })
        return rotateStream
    }
}

/**
 * Check and make parent directory
 * @param pathWithFile
 */
const mkDirForFile = function (pathWithFile: string) {
    const _path = path.dirname(pathWithFile)
    _path.split(path.sep).reduce(
        (fullPath, folder) => {
            fullPath += folder + path.sep
            // Option to replace existsSync as deprecated. Maybe in a future release.
            // try{
            //     var stats = fs.statSync(fullPath);
            //     console.log('STATS',fullPath, stats);
            // }catch(e){
            //     fs.mkdirSync(fullPath);
            //     console.log("STATS ERROR",e)
            // }
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath)
            }
            return fullPath
        },
        '',
    )
}

/**
 * Bubbles events to the proxy
 * @param emitter
 * @param proxy
 * @constructor
 */
const BubbleEvents = function BubbleEvents(emitter: fs.WriteStream, proxy: { emit: (arg0: string, arg1?: any) => void }) {
    emitter.on('close', () => {
        proxy.emit('close')
    })
    emitter.on('finish', () => {
        proxy.emit('finish')
    })
    emitter.on('error', (err: any) => {
        proxy.emit('error', err)
    })
    emitter.on('open', (fd: any) => {
        proxy.emit('open', fd)
    })
}
/**
 * FileStreamRotator:
 *
 * Returns a file stream that auto-rotates based on date.
 *
 * Options:
 *
 *   - `filename`       Filename including full path used by the stream
 *
 *   - `frequency`      How often to rotate. Options are 'daily', 'custom' and 'test'. 'test' rotates every minute.
 *                      If frequency is set to none of the above, a YYYYMMDD string will be added to the end of the filename.
 *
 *   - `verbose`        If set, it will log to STDOUT when it rotates files and name of log file. Default is TRUE.
 *
 *   - `date_format`    Format as used in moment.js http://momentjs.com/docs/#/displaying/format/. The result is used to replace
 *                      the '%DATE%' placeholder in the filename.
 *                      If using 'custom' frequency, it is used to trigger file change when the string representation changes.
 *
 *   - `size`           Max size of the file after which it will rotate. It can be combined with frequency or date format.
 *                      The size units are 'k', 'm' and 'g'. Units need to directly follow a number e.g. 1g, 100m, 20k.
 *
 *   - `max_logs`       Max number of logs to keep. If not set, it won't remove past logs. It uses its own log audit file
 *                      to keep track of the log files in a json format. It won't delete any file not contained in it.
 *                      It can be a number of files or number of days. If using days, add 'd' as the suffix.
 *
 *   - `audit_file`     Location to store the log audit file. If not set, it will be stored in the root of the application.
 *
 *   - `end_stream`     End stream (true) instead of the default behaviour of destroy (false). Set value to true if when writing to the
 *                      stream in a loop, if the application terminates or log rotates, data pending to be flushed might be lost.
 *
 *   - `file_options`   An object passed to the stream. This can be used to specify flags, encoding, and mode.
 *                      See https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options. Default `{ flags: 'a' }`.
 *
 *   - `utc`            Use UTC time for date in filename. Defaults to 'FALSE'
 *
 *   - `extension`      File extension to be appended to the filename. This is useful when using size restrictions as the rotation
 *                      adds a count (1,2,3,4,...) at the end of the filename when the required size is met.
 *
 *   - `watch_log`      Watch the current file being written to and recreate it in case of accidental deletion. Defaults to 'FALSE'
 *
 *   - `create_symlink` Create a tailable symlink to the current active log file. Defaults to 'FALSE'
 *
 *   - `symlink_name`   Name to use when creating the symbolic link. Defaults to 'current.log'
 *
 * To use with Express / Connect, use as below.
 *
 * var rotatingLogStream = require('FileStreamRotator').getStream({filename:"/tmp/test.log", frequency:"daily", verbose: false})
 * app.use(express.logger({stream: rotatingLogStream, format: "default"}));
 *
 * @param {Object} options
 * @return {Object}
 * @api public
 */
const FileStreamRotator = {
    getFrequency,
    parseFileSize,
    getDate,
    setAuditLog,
    writeAuditLog,
    addLogToAudit,
    getStream,
}

module.exports = FileStreamRotator
export default FileStreamRotator