import { AppiumOcrPlugin } from '../..'
import { expect } from 'earljs'

const fakeDriver = {
    async getSettings() {
        return {}
    }
}

describe('AppiumOcrPlugin', function() {
    it('should ready a worker', async function() {
        expect(AppiumOcrPlugin).toBeDefined()
        const p = new AppiumOcrPlugin('foo')
        expect(p.isWorkerReady).toEqual(false)
        await p.readyWorker(fakeDriver)
        expect(p.isWorkerReady).toEqual(true)
        if (p.worker) {
            await p.worker.terminate()
        }
    })
})
