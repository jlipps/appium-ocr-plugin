import { AppiumOcrPlugin, NextHandler } from '..'
import type { Bbox } from 'tesseract.js'
import { util } from 'appium/support'
import type { ExternalDriver } from '@appium/types';
import { errors } from 'appium/driver';


export type Location = {
    x: number,
    y: number,
}
export type Size = {
    width: number,
    height: number
}
export type Rect = Location & Size

const TAP_DURATION_MS = 250
export const OCR_ELEMENT_PREFIX = 'ocr-element-'

export class OCRElement {

    text: string
    confidence: number
    rect: Rect
    id: string

    constructor(text: string, confidence: number, bbox: Bbox) {
        this.text = text
        this.confidence = confidence
        this.rect = {
            x: bbox.x0,
            y: bbox.y0,
            width: bbox.x1 - bbox.x0,
            height: bbox.y1 - bbox.y0,
        }
        this.id = `${OCR_ELEMENT_PREFIX}${util.uuidV4()}`
    }

    get size(): Size {
        return { width: this.rect.width, height: this.rect.height }
    }

    get location(): Location {
        return { x: this.rect.x, y: this.rect.y }
    }

    get center(): Location {
        return {
            x: this.rect.x + this.rect.width / 2,
            y: this.rect.y + this.rect.height / 2,
        }
    }

    get asW3CElementObject() {
        return {[util.W3C_WEB_ELEMENT_IDENTIFIER]: this.id}
    }
}

export async function ocrElementGuard(this: AppiumOcrPlugin, next: NextHandler, elId: string,
                                      fn: (el: OCRElement) => Promise<any>) {
    return await this.ocrContextGuard(next, async () => {
        const el = this.ocrElements[elId]
        if (!el) {
            throw new errors.NoSuchElementError()
        }
        return await fn(el)
    })
}

export async function click(this: AppiumOcrPlugin, next: NextHandler, driver: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => {
        const {x, y} = el.center
        this.logger.info(`Will tap on image element at coordinate [${x}, ${y}]`)

        const action = {
            type: 'pointer' as const,
            id: 'mouse',
            parameters: {pointerType: 'touch' as const},
            actions: [
                {type: 'pointerMove' as const, x, y, duration: 0},
                {type: 'pointerDown' as const, button: 0},
                {type: 'pause' as const, duration: TAP_DURATION_MS},
                {type: 'pointerUp' as const, button: 0},
            ]
        }

        // check if the driver has the appropriate performActions method
        if (driver.performActions) {
          return await driver.performActions([action])
        }

        throw new Error("Driver did not implement the 'performActions' command")
    })
}

export async function elementDisplayed(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async () => true)
}

export async function getSize(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => el.size)
}

export async function getLocation(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => el.location)
}

export async function getElementRect(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => el.rect)
}

export async function getText(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => el.text)
}

export async function getAttribute(this: AppiumOcrPlugin, next: NextHandler, _: ExternalDriver, attr: string, elId: string) {
    return await this.ocrElementGuard(next, elId, async (el) => {
        if (attr !== 'confidence') {
            throw new Error(`Unsupported OCR element attribute '${attr}'`)
        }
        return el.confidence
    })
}
