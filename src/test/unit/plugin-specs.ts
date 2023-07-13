import { AppiumOcrPlugin } from '../..'
import { expect } from 'earl'
import fs from 'fs/promises';
import path from 'path';
import {ExternalDriver} from 'appium/build/lib/appium';

const SETTINGS = {}
const SCREEN_FIXTURE = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'screen.png')

function getFakeDriver({settings = SETTINGS} = {}) {
    return {
        settings: {
            getSettings() {
                return settings
            },
        },
        opts: {
            platformName: 'iOS',
        },
        async getScreenshot() {
            const screen = await fs.readFile(SCREEN_FIXTURE)
            return screen.toString('base64')
        }
    } as unknown as ExternalDriver
}

describe('AppiumOcrPlugin', function() {
    it('should ready a worker', async function() {
        expect(AppiumOcrPlugin).toBeTruthy()
        const p = new AppiumOcrPlugin('foo')
        expect(p.isWorkerReady).toEqual(false)
        const d = getFakeDriver()
        await p.readyWorker(d)
        expect(p.isWorkerReady).toEqual(true)
        if (p.worker) {
            await p.worker.terminate()
        }
    })

    it('should process a screenshot', async function () {
        const p = new AppiumOcrPlugin('test')
        const d = getFakeDriver()
        const {words} = await p.getOcrText(async () => {}, d)
        const echoBoxWords = words.filter((w) => w.text === 'EchoBox')
        const echoBoxWord = echoBoxWords[0]
        expect(echoBoxWord).toBeTruthy()
        expect(echoBoxWord.confidence).toBeGreaterThan(70)
        await p.worker?.terminate()
    });
})
