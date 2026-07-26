import { Link } from "react-router-dom";

import type { PublicCard } from "./api";
import { kindLabel, localityText, priceText, specs } from "./format";

export function PropertyCard({ item }: { item: PublicCard }) {
  const price = priceText(item);
  const slug = item.slug ?? item.code;
  return (
    <Link to={`/imoveis/${encodeURIComponent(slug)}`} className="card">
      <div
        className="cover"
        style={item.cover_url ? { backgroundImage: `url(${item.cover_url})` } : undefined}
      >
        <span className="tag">{item.code}</span>
        {!item.cover_url ? <div className="noimg">sem foto</div> : null}
      </div>
      <div className="body">
        <div className="title">{item.title}</div>
        <div className="loc">
          {kindLabel(item.kind)} · {localityText(item.address)}
        </div>
        <div className="specs">
          {specs(item).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        {(item.pet_allowed || item.republic_allowed || item.has_leisure_area) ? (
          <div className="flags">
            {item.pet_allowed ? <span>Pet ok</span> : null}
            {item.republic_allowed ? <span>República</span> : null}
            {item.has_leisure_area ? <span>Área de lazer</span> : null}
          </div>
        ) : null}
        <div className="price">
          {price.value}
          {price.per ? <small> {price.per}</small> : null}
        </div>
      </div>
    </Link>
  );
}
