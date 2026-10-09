"use client";
import DocumentsManager from "@/components/DocumentsManager";
export default function DeliveryNotesPage(){
  return (
    <DocumentsManager
      config={{
        type: "delivery_note",
        title: "Lieferscheine",
        subtitle: "Materialnachweise aus Aufträgen — aus der Akte oder mit Auftrag + Positionen",
        singular: "Lieferschein",
        newLabel: "Neuer Lieferschein",
        icon: "📦",
      }}
    />
  );
}
