const FACTURX_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

export async function embedZugferdXml(pdfBytes: Uint8Array, xml: string) {
  const { PDFDocument, PDFName, AFRelationship } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdfBytes);
  await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X / ZUGFeRD EN 16931",
    afRelationship: AFRelationship.Data,
  });
  const metadata = doc.context.flateStream(FACTURX_XMP, { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(metadata));
  doc.setProducer("WorkLevel");
  doc.setCreator("WorkLevel");
  doc.setKeywords(["ZUGFeRD", "Factur-X", "EN 16931"]);
  return doc.save();
}
