import { Card } from '../components/ui';

export default function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card className="p-8 text-center">
        <p className="text-muted">
          This page arrives in <span className="text-text font-medium">{milestone}</span>.
        </p>
        <p className="text-xs text-muted mt-2">The data is already imported and waiting.</p>
      </Card>
    </div>
  );
}
