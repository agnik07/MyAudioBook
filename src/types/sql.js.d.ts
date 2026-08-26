declare module 'sql.js' {
  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export class Statement {
    bind(values?: any[] | Record<string, any>): boolean;
    step(): boolean;
    getAsObject(params?: any[] | Record<string, any>): Record<string, any>;
    run(values?: any[] | Record<string, any>): void;
    free(): boolean;
  }

  export class Database {
    constructor();
    constructor(data: ArrayLike<number> | Buffer);
    exec(sql: string): QueryExecResult[];
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export default function initSqlJs(config?: InitSqlJsOptions): Promise<{
    Database: typeof Database;
  }>;
}
