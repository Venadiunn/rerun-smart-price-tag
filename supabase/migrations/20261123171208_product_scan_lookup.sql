-- These expressions match all three branches of the scan identifier lookup.
create index rerun_products_sku_idx on public.products ((data->>'sku'));
create index rerun_products_barcode_idx on public.products ((data->>'barcode'))
where data->>'barcode'<>'';
analyze public.products;
