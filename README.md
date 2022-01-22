# Appium OCR Plugin

This is a [Tesseract](https://github.com/tesseract-ocr/tesseract)-based OCR plugin for Appium. It relies on [Tesseract.js](https://tesseract.projectnaptha.com/) for the OCR processing.

## Features

1. **New OCR endpoint** - call a new Appium server endpoint to perform OCR on the current screenshot, and return matching text and metadata.
2. **OCR context** - switch to the `OCR` context and the page source will be updated to respond with XML corresponding to text objects found on the screen.
3. **Find elements by OCR text** - When in the OCR context, using XPath will find "elements" based on the OCR XML version of the page source. These found elements can then be interacted with in minimal ways (click, getText) based purely on screen position.

## Prerequisites

* Appium Server 2.0+

## Installation - Server

Install the plugin using Appium's plugin CLI:

```
appium plugin install --source=npm appium-ocr-plugin
```

## Installation - Client

The only feature which requires an update on the client is the new `getOcrText` server endpoint. There are currently not any official client plugins for this feature. Some may be developed in the future. But reference, here is how to add the command to WebdriverIO:

```js
browser.addCommand('getOcrText', command('POST', '/session/:sessionId/appium/ocr', {
    command: 'getOcrText',
    description: 'Get all OCR text',
    ref: '',
    variables: [],
    parameters: []
}))
```

## Activation

The plugin will not be active unless turned on when invoking the Appium server:

```
appium --use-plugins=images
```

## Usage

### Response value terminology

Here is the meaning for the various response values you might find while using this plugin:

* `confidence` - Tesseract's confidence level (on a scale of 0 to 100) for the result of the OCR process for a given piece of text
* `bbox` - "bounding box", an object containing values labeled `x0`, `x1`, `y0`, and `y1`. Here, `x0` means the left-hand x-coordinate of the box defining the discovered text, `x1` means the right-hand x-coordinate, `y0` means the upper y-coordinate, and `y1` the lower y-coordinate.

### `getOcrText` endpoint

Sending a POST request to `/session/:sessionid/appium/ocr` will perform OCR on the current screenshot and respond with a JSON object containing three keys:

* `words` - Tesseract's guess at individual words
* `lines` - Tesseract's guess at lines of text
* `blocks` - Tesseract's guess at contiguous blocks of text

Each of these keys references an array of OCR objects, themselves containing 3 keys:

* `text`: the text discovered
* `confidence`: the confidence of the correctness of the resulting text
* `bbox`: the bounding box of the discovered text (see above)

### The `OCR` context

With this plugin active, you will notice an extra context available in a call to `getContexts`: `OCR`. When you switch to the `OCR` context (via `driver.setContext('OCR')` or equivalent), certain commands will have new behaviours.

#### Get Page Source

When retrieving page source in the OCR context, the result will be an XML document with basically the same data as that returned by the `getOcrText` command. Here is an example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<OCR>
    <words>
        <item confidence="82.16880798339844" x0="196" x1="237" y0="528" y1="542">photo</item>
        <item confidence="87.81583404541016" x0="243" x1="288" y0="527" y1="542">library</item>
        <item confidence="92.86579132080078" x0="21" x1="69" y0="567" y1="581">Picker</item>
    </words>
    <lines>
        <item confidence="87.97928619384766" x0="34" x1="66" y0="18" y1="30">9:38</item>
        <item confidence="64.12049865722656" x0="312" x1="355" y0="18" y1="29">T -</item>
        <item confidence="88.1034164428711" x0="154" x1="221" y0="59" y1="75">The App</item>
        <item confidence="92.1086654663086" x0="9" x1="179" y0="99" y1="110">Choose An Awesome View</item>
        <item confidence="92.64363098144531" x0="21" x1="93" y0="136" y1="149">Echo Box</item>
        <item confidence="89.5836410522461" x0="21" x1="327" y0="157" y1="172">Write something and save to local memory</item>
    </lines>
    <blocks>
        <item confidence="87.97928619384766" x0="34" x1="66" y0="18" y1="30">9:38</item>
        <item confidence="64.12049865722656" x0="312" x1="355" y0="18" y1="29">T -</item>
        <item confidence="88.1034164428711" x0="154" x1="221" y0="59" y1="75">The App</item>
        <item confidence="92.1086654663086" x0="9" x1="179" y0="99" y1="110">Choose An Awesome View</item>
        <item confidence="92.64363098144531" x0="21" x1="93" y0="136" y1="149">Echo Box</item>
        <item confidence="89.5836410522461" x0="21" x1="327" y0="157" y1="172">Write something and save to local memory</item>
    </blocks>
</OCR>
```

### Find Element(s)

When in the OCR context, you have access to a single locator strategy: `xpath`. The value of your selector will form the basis of a query against the page source as retrieved and described in the previous section. Any matching elements will be returned to your client. These elements will not be standard UI elements (i.e., `XCUIElementTypeText` or `android.widget.TextView`). Instead they are a sort of "virtual" element that only allows the following methods:

* `Click Element`: perform a single tap action at the center point of the bounding box for the selected element
* `Is Element Displayed`: always returns `true`, since if the element weren't displayed, it wouldn't be amenable to OCR
* `Get Element Size`: returns data from the bounding box in the appropriate format
* `Get Element Location`: returns data from the bounding box in the appropriate format
* `Get Element Rect`: returns data from the bounding box in the appropriate format
* `Get Element Text`: returns the text discovered via the OCR (same text as in the page source output)
* `Get Element Attribute`: only one attribute (`confidence`) can be retrieved, and it returns the confidence value

## Development

PRs welcomed!

### Setup

1. Clone repo
2. `npm install`

### Run tests

1. Link this repo into an Appium server (e.g., `appium plugin install --source=local $(pwd)` from this plugin development directory)
2. Start the Appium server (e.g., `appium --use-plugins=ocr`)
3. export the `TEST_APP_PATH` env var to a path to TheApp.app.zip
4. `npm run test:unit`
5. `npm run test:e2e`
