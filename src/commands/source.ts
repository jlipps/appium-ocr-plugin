import type { ExternalDriver } from '@appium/types';
import { AppiumOcrPlugin, OcrResponse, OcrData, NextHandler } from '..'
import { escape } from 'lodash'

function converOcrToXml(ocr: OcrResponse): string {

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

    return `<?xml version="1.0" encoding="utf-8"?>\n` +
           `<OCR>\n${words}\n${lines}\n${blocks}\n</OCR>`
}

export async function getPageSource(this: AppiumOcrPlugin, next: NextHandler, driver: ExternalDriver) {
    if (!this.isInOcrContext) {
        return await next()
    }
    const ocrRes = await this.getOcrText(next, driver)
    return converOcrToXml(ocrRes)
}
