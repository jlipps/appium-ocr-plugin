import BasePlugin from '@appium/base-plugin'
import type { BaseDriver } from '@appium/base-driver'
import { createWorker, Worker, Word, Line, Block, Bbox, Page, PSM } from 'tesseract.js'
import path from 'path'
import {
    shouldAvoidProxy,
    getContexts,
    getCurrentContext,
    setContext,
    getPageSource,
    ocrElementGuard,
    click,
    elementDisplayed,
    getSize,
    getLocation,
    getElementRect,
    getText,
    getAttribute,
    findElement,
    findElements,
    _find,
} from './commands'
import { OCRElement } from './commands/element'

const DEFAULT_LANG = 'eng'
const CACHE_PATH = path.resolve(__dirname) // cache trained data in the build dir
export const OCR_CONTEXT = 'OCR'

export type NextHandler = () => Promise<any>

export type OcrData = {
    text: string,
    confidence: number,
    bbox: Bbox
}

export type OcrResponse = {
    words: OcrData[],
    lines: OcrData[],
    blocks: OcrData[]
}

export class AppiumOcrPlugin extends BasePlugin {

    worker: Worker
    isInOcrContext = false
    isWorkerReady = false
    ocrElements: {[id: string]: OCRElement}

    shouldAvoidProxy = shouldAvoidProxy
    getContexts = getContexts
    getCurrentContext = getCurrentContext
    setContext = setContext
    getPageSource = getPageSource
    ocrElementGuard = ocrElementGuard
    click = click
    getSize = getSize
    elementDisplayed = elementDisplayed
    getLocation = getLocation
    getElementRect = getElementRect
    getText = getText
    getAttribute = getAttribute
    findElement = findElement
    findElements = findElements
    _find = _find

    constructor(name: string) {
        super(name)
        this.worker = createWorker({
            logger: x => this.logger.debug(JSON.stringify(x)),
            cachePath: CACHE_PATH,
        })
        this.ocrElements = {}
    }

    static newMethodMap = {
        '/session/:sessionId/appium/ocr': {
            POST: {
                command: 'getOcrText',
                payloadParams: {
                    required: [],
                    optional: []
                },
                neverProxy: true,
            }
        },
    }

    async readyWorker(driver: BaseDriver) {
        await this.worker.load()
        let lang = (await driver.getSettings()).ocrLanguage as string
        let validChars = (await driver.getSettings()).ocrValidChars as string
        lang = lang || DEFAULT_LANG
        validChars = validChars || ''
        await this.worker.loadLanguage(lang)
        await this.worker.initialize(lang)
        await this.worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            tessedit_char_whitelist: validChars
        })
        this.isWorkerReady = true
    }

    getOcrDataFromResponse(data: Page, shotToScreenRatio: number): OcrResponse {
        function extractFields(dataSource: Word[] | Line[] | Block[]) {
            return dataSource.map((s) => ({
                text: s.text,
                confidence: s.confidence,
                bbox: {
                    x0: s.bbox.x0 / shotToScreenRatio,
                    y0: s.bbox.y0 / shotToScreenRatio,
                    x1: s.bbox.x1 / shotToScreenRatio,
                    y1: s.bbox.y1 / shotToScreenRatio,
                }
            }))
        }
        return {
            words: extractFields(data.words),
            lines: extractFields(data.lines),
            blocks: extractFields(data.blocks),
        }
    }

    async getOcrText(_: NextHandler, driver: BaseDriver): Promise<OcrResponse> {
        if (!driver.getScreenshot) {
            throw new Error(`This type of driver does not have a screenshot command defined; ` +
                            `screenshot taking is necessary for this plugin to work!`)
        }
        const b64Screenshot = await driver.getScreenshot()
        const image = Buffer.from(b64Screenshot, 'base64')

        if (!this.isWorkerReady) {
            await this.readyWorker(driver)
        }

        const { data } = await this.worker.recognize(image)

        const defaultShotToScreenRatio = driver.opts.platformName.toLowerCase() === 'ios' ? 3.12 : 1.0
        let shotToScreenRatio = driver.settings.getSettings().ocrShotToScreenRatio as number
        shotToScreenRatio = shotToScreenRatio || defaultShotToScreenRatio
        this.logger.info(`Using ${shotToScreenRatio} as the screenshot-to-screen size ratio`)

        return this.getOcrDataFromResponse(data, shotToScreenRatio)
    }

    async deleteSession(next: NextHandler) {
        try {
            await this.worker.terminate()
        } finally {
            await next()
        }
    }

    async ocrContextGuard(next: NextHandler, fn: () => Promise<any>) {
        if (!this.isInOcrContext) {
            return await next()
        }
        return await fn()
    }
}
