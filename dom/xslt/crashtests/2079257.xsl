<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:h="http://www.w3.org/1999/xhtml" exclude-result-prefixes="h">
  <xsl:output method="html"/>
  <xsl:template match="/">
    <html>
      <body>
        <iframe onload="top.hit()"><xsl:copy-of select="//h:x-src"/></iframe>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
