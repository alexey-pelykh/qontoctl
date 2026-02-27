function Link(el)
  if string.match(el.target, "^https?://") then
    return el
  end
  if string.match(el.target, "%.md$") or string.match(el.target, "%.md[#?]") then
    el.target = string.gsub(el.target, "%.md", ".html", 1)
    el.target = string.lower(el.target)
    el.target = string.gsub(el.target, "_", "-")
  end
  return el
end
