import { letterChunks, type LetterPrice, type OfferLetter } from "@/lib/offerLetter";

function Body({ text, prices }: { text: string; prices: LetterPrice[] }) {
  const pricesShown = { current: false };
  return (
    <>
      {letterChunks(text).map((chunk, index) => {
        if (chunk.kind === "gap") return <div key={index} className="letterGap" />;
        if (chunk.kind === "page") return null;
        if (chunk.kind === "bullet") return <p key={index} className="letterBullet">{chunk.text}</p>;
        if (chunk.kind === "prices") {
          if (pricesShown.current) return null;
          pricesShown.current = true;
          return <PriceTable key={index} prices={prices} />;
        }
        return <p key={index}>{chunk.text}</p>;
      })}
    </>
  );
}

function PriceTable({ prices }: { prices: LetterPrice[] }) {
  const rows = prices.filter((row) => row.description.trim() || row.price.trim());
  if (!rows.length) return null;
  return (
    <table className="letterPrice">
      <thead>
        <tr>
          <th>Leistung</th>
          <th>Preis netto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td>{row.description}</td>
            <td>{row.price}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OfferLetterView({
  title,
  intro,
  letter,
  prices,
}: {
  title?: string | null;
  intro?: string | null;
  letter: OfferLetter;
  prices: LetterPrice[];
}) {
  let pricesShown = letterChunks(intro || "").some((chunk) => chunk.kind === "prices");
  return (
    <div className="letterPaper">
      <h2>ANGEBOT</h2>
      {title ? <p className="letterSub">{title}</p> : null}
      {intro ? <Body text={intro} prices={prices} /> : null}
      {letter.sections.map((section, index) => {
        const showPrices = !pricesShown && letterChunks(section.body).some((chunk) => chunk.kind === "prices");
        if (showPrices) pricesShown = true;
        return (
          <section key={`${section.heading}-${index}`}>
            {section.heading ? <h3>{section.heading}</h3> : null}
            <Body text={section.body} prices={prices} />
          </section>
        );
      })}
      {!pricesShown ? <PriceTable prices={prices} /> : null}
      {letter.closing ? <p className="letterClosing">{letter.closing}</p> : null}
      {letter.orderRows.length > 0 && (
        <>
          <h3>AUFTRAGSERTEILUNG</h3>
          <table className="letterOrder">
            <tbody>
              {letter.orderRows.map((row, index) => (
                <tr key={index}>
                  <td>{row.label}</td>
                  <td>{row.value.trim() || "____________________"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {letter.hint ? <p className="letterHint">{letter.hint}</p> : null}
    </div>
  );
}
