import { BasePlugin } from 'appium/plugin'
import type { ExternalDriver } from '@appium/types'
import sharp from 'sharp';
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

// Tesseract allows language codes to prime the OCR engine. Set the default to just English. Can be
// overridden with the 'ocrLanguage' driver setting
const DEFAULT_LANG = 'eng'

// cache trained data in the build dir
const CACHE_PATH = path.resolve(__dirname)

// Sometimes the screenshot a platform returns can have a different number of pixels than the
// reported screen dimensions. We need screenshot pixels and screen pixels to match so that when we
// go to construct actions based on OCR locations from the screenshot, the screen locations for the
// actions are correct. The number here is "how many times bigger is the screenshot than the
// reported screen dimensions". These values can be overridden by the 'ocrShotToScreenRatio' driver
// setting
const SHOT_TO_SCREEN_RATIOS: Record<string, number> = {
    ios: 3.12,
    android: 1.0,
}

// The OCR process is much slower the bigger the screenshot is, so set some defaults for how much
// we want to downsample the screenshot to make things faster. The number here represents "by what
// factor should we reduce the dimension?" These values can be overridden by the
// 'ocrDownsampleFactor' driver setting. A value of null means "don't reduce"
const DOWNSAMPLE_FACTORS: Record<string, number | null> = {
    ios: SHOT_TO_SCREEN_RATIOS.ios,
    android: null,
}

const DEFAULT_CONTRAST = 0.5

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

    worker?: Worker
    isInOcrContext = false
    isWorkerReady = false
    ocrElements: { [id: string]: OCRElement }

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

    async readyWorker(driver: ExternalDriver) {
        this.worker = await createWorker({
            logger: x => this.logger.debug(JSON.stringify(x)),
            cachePath: CACHE_PATH,
        })
        let lang = driver.settings.getSettings().ocrLanguage
        let validChars = driver.settings.getSettings().ocrValidChars
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
            blocks: extractFields(data.blocks ?? []),
        }
    }

    async getOcrText(_: NextHandler, driver: ExternalDriver): Promise<OcrResponse> {
        if (!driver.getScreenshot) {
            throw new Error(`This type of driver does not have a screenshot command defined; ` +
                `screenshot taking is necessary for this plugin to work!`)
        }

        if (!driver.opts.platformName) {
            throw new Error(`Driver did not have platformName capability/opt defined`)
        }

        const platform = driver.opts.platformName.toLowerCase()

        const b64Screenshot = await driver.getScreenshot()
        let image = Buffer.from(b64Screenshot, 'base64')
        let sharpImage = sharp(image)

        let shotToScreenRatio = (driver.settings.getSettings().ocrShotToScreenRatio as number) ||
            SHOT_TO_SCREEN_RATIOS[platform] ||
            1.0
        this.logger.info(`Using ${shotToScreenRatio} as the screenshot-to-screen size ratio`)

        const downsampleFactor = (driver.settings.getSettings().ocrDownsampleFactor as number) ||
            DOWNSAMPLE_FACTORS[platform] ||
            null

        const shouldInvertColors = (driver.settings.getSettings().ocrInvertColors as boolean) ||
            false

        const contrast = (driver.settings.getSettings().ocrContrast as number) ||
            DEFAULT_CONTRAST

        // convert to grayscale and apply contrast to make it easier for tesseract
        sharpImage = sharpImage.greyscale().linear(contrast, -(128 * contrast) + 128)

        if (shouldInvertColors) {
            sharpImage = sharpImage.negate();
        }

        if (downsampleFactor && downsampleFactor !== 1) {
            this.logger.info(`Using downsample factor of ${downsampleFactor}`)
            const { width: curWidth, height: curHeight } = await sharpImage.metadata();
            if (!curWidth || !curHeight) {
                throw new Error(`Could not get width/height metadata from image`)
            }
            const newWidth = Math.round(curWidth / downsampleFactor)
            const newHeight = Math.round(curHeight / downsampleFactor)
            this.logger.info(`Resizing image from ${curWidth}x${curHeight} to ${newWidth}x${newHeight}`)
            const resizedImage = sharpImage.resize(newWidth, newHeight); // convert to ints
            image = await resizedImage.toBuffer();

            shotToScreenRatio = shotToScreenRatio / downsampleFactor
            this.logger.info(`Adjusting screenshot-to-screen size ratio to ${shotToScreenRatio} to account for downsampling`)
        }

        if (!this.isWorkerReady) {
            await this.readyWorker(driver)
        }

        if (!this.worker) {
            throw new Error(`OCR worker was not initialized`);
        }

        const { data } = await this.worker.recognize(image)

        return this.getOcrDataFromResponse(data, shotToScreenRatio)
    }

    async deleteSession(next: NextHandler) {
        try {
            if (this.worker) {
                await this.worker.terminate()
            }
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
