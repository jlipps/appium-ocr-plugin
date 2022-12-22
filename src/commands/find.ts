import { AppiumOcrPlugin, NextHandler } from '..'
import type { ExternalDriver } from '@appium/types';
import { select as xpathQuery } from 'xpath'
import { DOMParser } from 'xmldom'
import { OCRElement } from './element'

// for some reason tsc can't find the errors export from basedriver, but it's there
import * as bdStar from 'appium/driver'
const { errors } = bdStar as {[name: string]: any}

export async function findElement(this: AppiumOcrPlugin, next: NextHandler, driver: ExternalDriver, strategy: string, selector: string) {
    return await this._find(next, driver, strategy, selector, false)
}

export async function findElements(this: AppiumOcrPlugin, next: NextHandler, driver: ExternalDriver, strategy: string, selector: string) {
    return await this._find(next, driver, strategy, selector, true)
}

export async function _find(this: AppiumOcrPlugin, next: NextHandler, driver: ExternalDriver, strategy: string, selector: string, multiple: boolean) {
    return await this.ocrContextGuard(next, async () => {
        if (strategy !== 'xpath') {
            throw new errors.InvalidArgumentError(`The OCR context only supports the 'xpath' locator strategy`)
        }
        const xmlStr = await this.getPageSource(next, driver)
        const dom = new DOMParser().parseFromString(xmlStr)
        const nodes = xpathQuery(selector, dom) as Element[]

        const transformNodeToOcrElement = (n: Element) => {
            const bbox = {
                x0: parseFloat(getNodeAttrVal(n, 'x0')),
                y0: parseFloat(getNodeAttrVal(n, 'y0')),
                x1: parseFloat(getNodeAttrVal(n, 'x1')),
                y1: parseFloat(getNodeAttrVal(n, 'y1')),
            }
            const confidence = parseFloat(getNodeAttrVal(n, 'confidence'))
            const text = (n.firstChild as Text).data
            const ocrEl = new OCRElement(text, confidence, bbox)
            this.ocrElements[ocrEl.id] = ocrEl
            this.logger.info(`Found new element '${ocrEl.id}': [${text}][${confidence}[${JSON.stringify(ocrEl.rect)}]`)
            return ocrEl.asW3CElementObject
        }

        const els = nodes.filter(isOcrElementNodeValid).map(transformNodeToOcrElement)

        if (!multiple) {
            if (els.length < 1) {
                throw new errors.NoSuchElementError()
            }
            return els[0]
        }
        return els
    })
}

function isOcrElementNodeValid(n: Element): boolean {
    if (n.nodeName !== 'item') {
        return false
    }
    if (!n.firstChild) {
        return false
    }
    if (!(n.firstChild as Text).data) {
        return false
    }
    return true
}

function getNodeAttrVal (node: Element, attr: string) {
  const attrObjs = Object.values(node.attributes).filter((obj) => obj.name === attr)
  if (!attrObjs.length) {
    throw new Error(`Tried to retrieve a node attribute '${attr}' but the node didn't have it`)
  }
  return attrObjs[0].value
}
