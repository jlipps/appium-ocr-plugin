import { AppiumOcrPlugin, NextHandler, OCR_CONTEXT } from '..'

export function shouldAvoidProxy(this: AppiumOcrPlugin, _: string, route: string) {
    if (this.isInOcrContext) {
        return true
    }
    if (route.match(/\/contexts?$/)) {
        return true
    }
    return false
}

export async function getContexts(this: AppiumOcrPlugin, next: NextHandler) {
    let existingContexts = []
    try {
        existingContexts = await next()
    } catch (err) {
        this.logger.info(`Default behavior failed handling getContexts, ignoring`)
        this.logger.info(`Original error: ${err}`)
    }
    return [...existingContexts, OCR_CONTEXT]
}

export async function getCurrentContext(this: AppiumOcrPlugin, next: NextHandler) {
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

export async function setContext(this: AppiumOcrPlugin, next: NextHandler, name: string) {
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
