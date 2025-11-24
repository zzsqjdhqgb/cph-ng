import { Problem } from '@/utils/types.backend';
import { Server } from './server';
import { Submitter } from './submitter';

export default class Companion {
    public static init() {
        Server.init();
    }
    public static stopServer() {
        Server.stopServer();
    }
    public static async submit(problem?: Problem) {
        return Submitter.submit(problem);
    }
}
export * from './types';
