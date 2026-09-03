"""Merge a language's translations into its catalogue, in English's key order."""
import json, collections, pathlib, sys

def merge(code, pairs, reviewed="machine", note=None):
    root = pathlib.Path(__file__).resolve().parents[2]
    msg = root / "src/lib/i18n/messages"
    en = json.loads((msg / "en.json").read_text())
    keys = [k for k in en if not k.startswith("$")]
    f = msg / f"{code}.json"
    cur = json.loads(f.read_text()) if f.exists() else {}

    out = collections.OrderedDict()
    meta = cur.get("$meta", {"locale": code})
    meta["reviewedBy"] = reviewed
    if note: meta["note"] = note
    out["$meta"] = meta
    for k in keys:
        if k in pairs and pairs[k]:
            out[k] = pairs[k]
        elif k in cur:
            out[k] = cur[k]
    f.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")

    missing = [k for k in keys if k not in out]
    same = [k for k in keys if k in out and out[k] == en[k]]
    pct = round((len(keys) - len(missing) - len(same)) / len(keys) * 100)
    print(f"  {code}: {pct}%  missing={len(missing)}  same-as-en={len(same)}")
    return missing, same
