import type { RemoteOptions, Browser } from 'webdriverio'
import { OCR_CONTEXT, OcrResponse } from '../..'
import { remote } from 'webdriverio'
import type { Element } from 'webdriverio'
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
        await driver.$('~Login Screen').waitForExist({ timeout: 5000 })
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

    describe('when in the ocr context', function() {
        before(async function() {
            await driver.switchContext(OCR_CONTEXT)
        })

        after(async function() {
            await driver.switchContext('NATIVE_APP')
        })

        it('should get the ocr text in xml format', async function() {
            const source = await driver.getPageSource()
            expect(source).toEqual(expect.stringMatching('<OCR>'))
            expect(source).toEqual(expect.stringMatching('<words>'))
            expect(source).toEqual(expect.stringMatching('<lines>'))
        })

        it('should find single ocr elements by xpath', async function() {
            const el = await driver.$('//lines/item[contains(text(), "Login Screen")]')
        })

        it('should find multiple ocr elements by xpath', async function() {
            const els = await driver.$$('//lines/item[contains(text(), "Demo")]')
            expect(els.length).toBeGreaterThan(4)
        })

        it('should not find elements that do not exist', async function() {
            const els = await driver.$$('//item[contains(text(), "ZZZZ")]')
            expect(els.length).toEqual(0)
        })

        describe('with an element', function() {
            let el: Element<'async'>
            const targetSize = {
                width: expect.numberCloseTo(101, { delta: 5 }),
                height: expect.numberCloseTo(16, { delta: 5 })
            }
            const targetLoc = {
                x: expect.numberCloseTo(21, { delta: 5 }),
                y: expect.numberCloseTo(197, { delta: 5 }),
            }
            before(async function() {
                el = await driver.$('//lines/item[contains(text(), "Login Screen")]')
            })

            it('should get displayed', async function() {
                expect(await el.isDisplayed()).toEqual(true)
            })

            it('should get the size', async function() {
                expect(await el.getSize()).toEqual(targetSize)
            })

            it('should get the location', async function() {
                expect(await el.getLocation()).toEqual(targetLoc)
            })

            it('should get the rect', async function() {
                expect(await driver.getElementRect(el.elementId)).toEqual({...targetSize, ...targetLoc})
            })

            it('should get the text', async function() {
                expect(await el.getText()).toEqual(expect.stringMatching('Login Screen'))
            })

            it('should get the confidence attribute', async function() {
                const confidence = parseInt(await el.getAttribute('confidence'), 10)
                expect(confidence).toBeGreaterThan(50)
            })

            it('should click via w3c actions', async function() {
                await el.click()
                await driver.switchContext('NATIVE_APP')
                const username = await driver.$('~username')
                await username.waitForExist({ timeout: 2000 })
                await driver.back()
            })

        })

    })

    after(async function() {
        await driver.deleteSession()
    })
})
