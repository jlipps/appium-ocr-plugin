from appium import webdriver
from appium.webdriver.webdriver import ExtensionBase


# define an extension class
class OCRCommand(ExtensionBase):
    def method_name(self):
        return 'ocr_command'

    def ocr_command(self, argument):
        return self.execute(argument)['value']

    def add_command(self):
        return ('post', '/session/$sessionId/appium/ocr')


caps = {
    # set up your actual capabilities
}

# Load the driver with the extension
driver = webdriver.Remote("http://127.0.0.1:4723", desired_capabilities=caps, extensions=[OCRCommand])

# now you can use `driver.ocr_command`
result = driver.ocr_command({})

driver.quit()
