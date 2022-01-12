import { AppiumOcrPlugin } from '../..'
import { BaseDriver } from '@appium/base-driver'
import { expect } from 'earljs'

describe('AppiumOcrPlugin', function() {
    it('should ready a worker', async function() {
        const p = new AppiumOcrPlugin('foo')
        expect(p.isWorkerReady).toEqual(false)
        await p.readyWorker(new BaseDriver())
        expect(p.isWorkerReady).toEqual(true)
        await p.worker.terminate()
    })
})
