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
} from './commands'

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

    shouldAvoidProxy = shouldAvoidProxy
    getContexts = getContexts
    getCurrentContext = getCurrentContext
    setContext = setContext
    getPageSource = getPageSource

    constructor(name: string) {
        super(name)
        this.worker = createWorker({
            logger: x => this.logger.debug(JSON.stringify(x)),
            cachePath: CACHE_PATH,
        })
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

    getOcrDataFromResponse(data: Page): OcrResponse {
        function extractFields(dataSource: Word[] | Line[] | Block[]) {
            return dataSource.map((s) => ({
                text: s.text,
                confidence: s.confidence,
                bbox: s.bbox,
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
        return this.getOcrDataFromResponse(data)
    }

    async deleteSession(next: NextHandler) {
        try {
            await this.worker.terminate()
        } finally {
            await next()
        }
    }
}
