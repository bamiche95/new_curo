import { EmptyRow, ExpiryPill, SectionCard } from '@/components/customer-detail/section';
import { formatBytes, formatDate } from '@/lib/format';
import type { DocumentRow } from '@/lib/data/types';

/** Documents and links for the customer (uploads arrive in a later phase). */
export function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  return (
    <SectionCard title="Documents" count={documents.length}>
      {documents.length === 0 ? (
        <EmptyRow>No documents uploaded.</EmptyRow>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {document.title ?? document.document_path}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {document.document_type ?? 'Document'} · {document.storage_type === 'URL' ? 'Link' : 'File'}
                  {document.file_size ? ` · ${formatBytes(document.file_size)}` : ''} · added{' '}
                  {formatDate(document.created_at)}
                </p>
              </div>
              <ExpiryPill date={document.document_expiry_date} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
