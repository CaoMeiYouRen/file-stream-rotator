/// <reference types="node" />
import fs from 'fs';
import moment from 'moment';
import events from 'events';
import { URL } from 'url';
declare const FileStreamRotator: {
    getFrequency: (frequency: string) => false | {
        type: any;
        digit: number;
    };
    parseFileSize: (size: string) => number;
    getDate: (format: {
        type: string;
        digit: number;
    }, date_format: string, utc: boolean) => string;
    setAuditLog: (max_logs: {
        toString: () => string;
    }, audit_file: string, log_file: string) => any;
    writeAuditLog: (audit: {
        auditLog: string | number | Buffer | URL;
    }, verbose: any) => void;
    addLogToAudit: (logfile: any, audit: {
        files: {
            date: number;
            name: any;
            hash: string;
        }[];
        auditLog: string;
        keep: {
            days: any;
            amount: moment.DurationInputArg1;
        };
    }, stream: {
        emit: (arg0: string, arg1: any) => void;
    }, verbose: any) => {
        files: {
            date: number;
            name: any;
            hash: string;
        }[];
        auditLog: string;
        keep: {
            days: any;
            amount: moment.DurationInputArg1;
        };
    };
    getStream: (options: {
        filename: string;
        frequency: string;
        max_logs: any;
        audit_file: any;
        verbose: boolean;
        size: string;
        date_format: string;
        utc: boolean;
        create_symlink: boolean;
        extension: string;
        file_options: {
            flags: string;
        };
        symlink_name: any;
        watch_log: any;
        end_stream: boolean;
    }) => fs.WriteStream | (NodeJS.WriteStream & {
        fd: 1;
    }) | (events.EventEmitter & {
        auditLog?: any;
        end?: () => any;
        write?: (str: string | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array | DataView | ArrayBuffer | SharedArrayBuffer, encoding: BufferEncoding) => any;
    });
};
export default FileStreamRotator;
