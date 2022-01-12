import type { RemoteOptions, Browser } from 'webdriverio'
import { OCR_CONTEXT, OcrResponse } from '../..'
import { remote } from 'webdriverio'
import { command } from 'webdriver'
import { expect } from 'earljs'

const TEST_APP_PATH = process.env.TEST_APP_PATH

if (!TEST_APP_PATH) {
    throw new Error(`Must define TEST_APP_PATH`)
}

interface PluginDriver extends Browser<'async'> {
    getOcrText: () => Promise<OcrResponse>
}

const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:noReset': true,
    'appium:app': TEST_APP_PATH,
    'appium:platformVersion': '15.2',
    'appium:deviceName': 'iPhone 13',
}

const WDIO_PARAMS: RemoteOptions = {
    hostname: 'localhost',
    port: 4723,
    path: '/',
    connectionRetryCount: 0,
    logLevel: 'silent',
    capabilities
}

function updateWdioBrowser(browser: Browser<'async'>) {
    browser.addCommand('getOcrText', command('POST', '/session/:sessionId/appium/ocr', {
        command: 'getOcrText',
        description: 'Get all OCR text',
        ref: '',
        variables: [],
        parameters: []
    }))
}

describe('AppiumOcrPlugin', function() {
    let driver: PluginDriver
    before(async function() {
        driver = (await remote(WDIO_PARAMS)) as PluginDriver
        updateWdioBrowser(driver)
    })

    it('should find texts via new endpoint', async function() {
        const loginScreen = await driver.$('~Login Screen')
        await loginScreen.waitForExist({ timeout: 5000 })
        const ocr = await driver.getOcrText()
        const lines = ocr.lines.filter((l) => l.text.includes('Login Screen'))
        expect(lines).toBeAnArrayOfLength(1)
        expect(lines[0].confidence).toBeGreaterThan(0)
        expect(lines[0].bbox.x0).toBeGreaterThan(0)
        expect(lines[0].bbox.x1).toBeGreaterThan(0)
        expect(lines[0].bbox.y0).toBeGreaterThan(0)
        expect(lines[0].bbox.y1).toBeGreaterThan(0)
    })

    it('should add a new context to the context list', async function() {
        const contexts = await driver.getContexts()
        expect(contexts).toBeAContainerWith(OCR_CONTEXT)
    })

    it('should get the ocr text in xml format when in the ocr context', async function() {
        await driver.switchContext(OCR_CONTEXT)
        const source = await driver.getPageSource()
        try {
            expect(source).toEqual(expect.stringMatching('<OCR>'))
            expect(source).toEqual(expect.stringMatching('<words>'))
            expect(source).toEqual(expect.stringMatching('<lines>'))
        } finally {
            await driver.switchContext('NATIVE_APP')
        }
    })

    after(async function() {
        await driver.deleteSession()
    })
})
