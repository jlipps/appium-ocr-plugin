import BasePlugin from '@appium/base-plugin'
import type { BaseDriver } from '@appium/base-driver'
import type { Browser } from 'webdriverio'
import { createWorker, Worker, Word, Line, Block, Bbox, Page } from 'tesseract.js'

const DEFAULT_LANG = 'eng'

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
            logger: x => this.logger.debug(JSON.stringify(x))
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
        lang = lang || DEFAULT_LANG
        await this.worker.loadLanguage(lang)
        await this.worker.initialize(lang)
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

    async getOcrText(next: NextHandler, driver: BaseDriver): Promise<OcrResponse> {
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
}
