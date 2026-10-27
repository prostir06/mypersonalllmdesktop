-- Widen file_type for Office OpenXML MIME strings (e.g. XLSX ~73 chars).
ALTER TABLE "documents" ALTER COLUMN "file_type" SET DATA TYPE VARCHAR(120);
