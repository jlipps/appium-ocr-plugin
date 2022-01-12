import BasePlugin from '@appium/base-plugin'
import type { BaseDriver } from '@appium/base-driver'
import { createWorker, Worker, Word, Line, Block, Bbox, Page, PSM } from 'tesseract.js'
import path from 'path'
import { escape } from 'lodash'

const DEFAULT_LANG = 'eng'
const CACHE_PATH = path.resolve(__dirname) // cache trained data in the build dir
export const OCR_CONTEXT = 'OCR'

type NextHandler = () => Promise<any>

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

    shouldAvoidProxy(method: string, route: string) {
        if (this.isInOcrContext) {
            return true
        }
        if (route.match(/\/contexts?$/)) {
            return true
        }
        return false
    }

    async getContexts(next: NextHandler) {
        let existingContexts = []
        try {
            existingContexts = await next()
        } catch (err) {
            this.logger.info(`Default behavior failed handling getContexts, ignoring`)
            this.logger.info(`Original error: ${err}`)
        }
        return [...existingContexts, OCR_CONTEXT]
    }

    async getCurrentContext(next: NextHandler) {
        if (this.isInOcrContext) {
            return OCR_CONTEXT
        }
        try {
            return await next()
        } catch (err) {
            this.logger.info(`Default behavior failed handling getContext, ignoring`)
            this.logger.info(`Original error: ${err}`)
            return null
        }
    }

    async setContext(next: NextHandler, name: string) {
        if (name !== OCR_CONTEXT) {
            this.isInOcrContext = false
            try {
                return await next()
            } catch (err) {
                this.logger.info(`Default behavior failed handling setContext, ignoring`)
                this.logger.info(`Original error: ${err}`)
            }
        }
        this.isInOcrContext = true
    }

    converOcrToXml(ocr: OcrResponse): string {

        function getXmlNodes(ocrItemArray: OcrData[]): string[] {
            return ocrItemArray.map((i) => (
                `<item ` +
                    `confidence="${i.confidence}" ` +
                    `x0="${i.bbox.x0}" x1="${i.bbox.x1}" ` +
                    `y0="${i.bbox.y0}" y1="${i.bbox.y1}"` +
                `>${escape(i.text).trim()}</item>`
            ))
        }

        function xmlNodeSection(nodes: string[]): string {
            return nodes.map((n) => `\t\t${n}`).join('\n')
        }

        const wordNodes = xmlNodeSection(getXmlNodes(ocr.words))
        const lineNodes = xmlNodeSection(getXmlNodes(ocr.lines))
        const blockNodes = xmlNodeSection(getXmlNodes(ocr.blocks))

        const words = `\t<words>\n${wordNodes}\n\t</words>`
        const lines = `\t<lines>\n${lineNodes}\n\t</lines>`
        const blocks = `\t<blocks>\n${blockNodes}\n\t</blocks>`

        return `<?xml version="1.0" encoding="utf-8"?>` +
               `<OCR>\n${words}\n${lines}\n${blocks}\n</OCR>`
    }

    async getPageSource(next: NextHandler, driver: BaseDriver) {
        if (!this.isInOcrContext) {
            return await next()
        }
        const ocrRes = await this.getOcrText(next, driver)
        return this.converOcrToXml(ocrRes)
    }

    async deleteSession(next: NextHandler) {
        try {
            await this.worker.terminate()
        } finally {
            await next()
        }
    }
}
