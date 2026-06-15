import castArray from 'lodash-es/castArray';

import type { SubDomain } from '../index';
import type { DataOptions, DataGroupType, DataRecord } from '../options/Options';
import { DomainType, Timestamp } from '../index';
import type DateHelper from '../helpers/DateHelper';

export const DOMAIN_FORMAT: Record<DomainType, string> = {
    year: 'YYYY',
    month: 'MMMM',
    week: 'wo [week] YYYY',
    xDay: 'Do MMM',
    ghDay: 'Do MMM',
    day: 'Do MMM',
    hour: 'HH:00',
    minute: 'HH:mm',
};

type GroupedRecords = Map<Timestamp, { [key: Timestamp]: DataRecord[] }>;
type ValueType = string | number | null;

export default class DomainCollection {
    collection: Map<Timestamp, SubDomain[]>;

    dateHelper: DateHelper;

    min: Timestamp;

    max: Timestamp;

    keys: Timestamp[];

    yankedDomains: Timestamp[];

    constructor(
        dateHelper: DateHelper,
        interval?: DomainType,
        start?: Date | Timestamp,
        range?: Date | Timestamp,
        excludeEnd: boolean = false
    ) {
        this.collection = new Map();
        this.dateHelper = dateHelper;

        if (interval && start && range) {
            const ts = this.dateHelper
                .intervals(interval, start, range, excludeEnd)
                .map((d: Timestamp) => castArray(d));

            // @ts-ignore
            this.collection = new Map(ts);
        }

        this.min = 0;
        this.max = 0;
        this.keys = [];
        this.yankedDomains = [];

        if (this.collection.size > 0) {
            this.#refreshKeys();
        }
    }

    has(key: Timestamp): boolean {
        return this.collection.has(key);
    }

    get(key: Timestamp) {
        return this.collection.get(key);
    }

    forEach(callback: any) {
        return this.collection.forEach(callback);
    }

    at(index: number): Timestamp {
        return this.keys[index];
    }

    clamp(minDate?: Timestamp, maxDate?: Timestamp): DomainCollection {
        if (minDate && this.min! < minDate) {
            for (let i = 0; i < this.keys.length; i++) {
                const key = this.keys[i];
                if (key < minDate) {
                    this.collection.delete(key);
                }
            }
        }

        if (maxDate && this.max! > maxDate) {
            for (let i = 0; i < this.keys.length; i++) {
                const key = this.keys[i];
                if (key > maxDate) {
                    this.collection.delete(key);
                }
            }
        }

        this.#refreshKeys();

        return this;
    }

    merge(newCollection: DomainCollection, limit: number, createValueCallback: Function): void {
        this.yankedDomains = [];

        for (let index = 0; index < newCollection.keys.length; index++) {
            const domainKey = newCollection.keys[index];
            if (this.has(domainKey)) {
                continue;
            }

            if (this.collection.size >= limit) {
                let keyToRemove = this.max;

                if (domainKey > this.max!) {
                    keyToRemove = this.min;
                }

                if (keyToRemove && this.collection.delete(keyToRemove)) {
                    this.yankedDomains.push(keyToRemove);
                }
            }
            this.collection.set(domainKey, createValueCallback(domainKey, index));
            this.#refreshKeys();
        }
        this.yankedDomains = this.yankedDomains.sort((a, b) => a - b);
    }

    slice(limit: number = 0, fromBeginning: boolean = true): DomainCollection {
        if (this.keys.length > limit) {
            const keysToDelete = fromBeginning
                ? this.keys.slice(0, -limit)
                : this.keys.slice(limit);

            for (let i = 0; i < keysToDelete.length; i++) {
                this.collection.delete(keysToDelete[i]);
            }

            this.#refreshKeys();
        }

        return this;
    }

    fill(
        data: DataRecord[],
        {
            x,
            y,
            groupY,
            defaultValue,
        }: {
            x: DataOptions['x'];
            y: DataOptions['y'];
            groupY: DataOptions['groupY'];
            defaultValue: DataOptions['defaultValue'];
        },
        subDomainKeyExtractor: Function
    ): void {
        const groupedRecords: GroupedRecords = this.groupRecords(data, x, subDomainKeyExtractor);

        for (let i = 0; i < this.keys.length; i++) {
            const domainKey = this.keys[i];
            const records = groupedRecords.get(domainKey) || {};
            this.#setSubDomainValues(domainKey, records, y, groupY, defaultValue);
        }
    }

    #setSubDomainValues(
        domainKey: Timestamp,
        records: { [key: string]: DataRecord[] },
        y: DataOptions['y'],
        groupY: DataOptions['groupY'],
        defaultValue: DataOptions['defaultValue']
    ): void {
        const subDomains = this.get(domainKey)!;
        for (let index = 0; index < subDomains.length; index++) {
            const subDomain = subDomains[index];
            let value: ValueType = defaultValue;
            if (records.hasOwnProperty(subDomain.t)) {
                value = this.groupValues(this.#extractValues(records[subDomain.t], y), groupY);
            }

            subDomains[index].v = value;
        }
    }

    groupRecords(
        data: DataRecord[],
        x: DataOptions['x'],
        subDomainKeyExtractor: Function
    ): GroupedRecords {
        const results: GroupedRecords = new Map();
        const validSubDomainTimestamp: Map<Timestamp, Timestamp> = new Map();
        for (let i = 0; i < this.keys.length; i++) {
            const domainKey = this.keys[i];
            const subDomains = this.get(domainKey)!;
            for (let j = 0; j < subDomains.length; j++) {
                validSubDomainTimestamp.set(subDomains[j].t, domainKey);
            }
        }

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const timestamp = this.extractTimestamp(d, x, subDomainKeyExtractor);

            if (validSubDomainTimestamp.has(timestamp)) {
                const domainKey = validSubDomainTimestamp.get(timestamp)!;
                const records = results.get(domainKey) || {};
                records[timestamp] ||= [];
                records[timestamp].push(d);

                results.set(domainKey, records);
            }
        }

        return results;
    }

    // eslint-disable-next-line class-methods-use-this
    #extractValues(data: DataRecord[], y: string | Function): ValueType[] {
        const len = data.length;
        const result = new Array(len);
        for (let i = 0; i < len; i++) {
            const d = data[i];
            result[i] = typeof y === 'function' ? y(d) : d[y];
        }
        return result;
    }

    // eslint-disable-next-line class-methods-use-this
    groupValues(
        values: ValueType[],
        groupFn: DataGroupType | ((values: ValueType[]) => ValueType)
    ): ValueType {
        const cleanedValues = values.filter((n) => n !== null);

        if (typeof groupFn === 'string') {
            if (cleanedValues.every((n) => typeof n === 'number')) {
                switch (groupFn) {
                    case 'sum':
                        return (cleanedValues as number[]).reduce((a, b) => a + b, 0);
                    case 'count':
                        return cleanedValues.length;
                    case 'min':
                        return Math.min(...(cleanedValues as number[])) || null;
                    case 'max':
                        return Math.max(...(cleanedValues as number[])) || null;
                    case 'average':
                        return cleanedValues.length > 0
                            ? (cleanedValues as number[]).reduce((a, b) => a + b, 0) /
                                  cleanedValues.length
                            : null;
                    default:
                        return null;
                }
            }

            switch (groupFn) {
                case 'count':
                    return cleanedValues.length;
                default:
                    return null;
            }
        } else if (typeof groupFn === 'function') {
            return groupFn(cleanedValues);
        }

        return null;
    }

    // eslint-disable-next-line class-methods-use-this
    extractTimestamp(datum: DataRecord, x: string | Function, extractorFn: Function): Timestamp {
        let timestamp: string | Timestamp = typeof x === 'function' ? x(datum) : datum[x];

        if (typeof timestamp === 'string') {
            timestamp = +new Date(timestamp);
        }

        return extractorFn(timestamp);
    }

    #refreshKeys(): Timestamp[] {
        this.keys = Array.from(this.collection.keys())
            .map((d: any) => parseInt(d, 10))
            .sort((a, b) => a - b);

        const { keys } = this;
        // eslint-disable-next-line prefer-destructuring
        this.min = keys[0];
        this.max = keys[keys.length - 1];

        return this.keys;
    }
}
