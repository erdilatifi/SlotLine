import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
} from "../../components/ui";
import { CardListSkeleton, PageHeaderSkeleton } from "../../components/Skeletons";
import { cn } from "../../lib/cn";
import { useOrg } from "../../lib/OrgContext";
import { dashboardApi, type Service } from "../../lib/dashboardApi";

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180];
const BUFFERS = [0, 5, 10, 15, 20, 30];

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat([], { style: "currency", currency }).format(minor / 100);
}

export function ServicesPage() {
  const { token, activeSlug, data, loading, canManage, act, patch } = useOrg();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (loading) {
    return (
      <>
        <PageHeaderSkeleton />
        <CardListSkeleton />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="What people can book, how long it takes, and what it costs."
        actions={
          canManage && !adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add service
            </Button>
          ) : null
        }
      />

      {adding && activeSlug && (
        <div className="mb-4">
          <Card className="animate-rise p-5">
            <ServiceForm
              onCancel={() => setAdding(false)}
              onSave={(changes) =>
                void act(
                  () =>
                    dashboardApi.createService(token, activeSlug, {
                      name: changes.name!,
                      ...changes,
                    }),
                  (service) => {
                    patch((c) => ({ ...c, services: [...c.services, service] }));
                    setAdding(false);
                  },
                )
              }
            />
          </Card>
        </div>
      )}

      {data.services.length === 0 && !adding ? (
        <EmptyState
          title="Nothing bookable yet"
          hint="Add a service and your booking page can start taking appointments."
        />
      ) : (
        <div className="space-y-2">
          {data.services.map((service) =>
            editingId === service.id && activeSlug ? (
              <Card key={service.id} className="animate-rise p-5">
                <ServiceForm
                  service={service}
                  onCancel={() => setEditingId(null)}
                  onSave={(changes) =>
                    void act(
                      () => dashboardApi.updateService(token, activeSlug, service.id, changes),
                      (updated) => {
                        patch((c) => ({
                          ...c,
                          services: c.services.map((s) => (s.id === updated.id ? updated : s)),
                        }));
                        setEditingId(null);
                      },
                    )
                  }
                  onDelete={() =>
                    void act(
                      () => dashboardApi.deleteService(token, activeSlug, service.id),
                      (result) => {
                        patch((c) => ({
                          ...c,
                          services:
                            result.outcome === "deleted"
                              ? c.services.filter((s) => s.id !== service.id)
                              : c.services.map((s) =>
                                  s.id === service.id ? { ...s, isActive: false } : s,
                                ),
                        }));
                        setEditingId(null);
                      },
                    )
                  }
                />
              </Card>
            ) : (
              <Card
                key={service.id}
                className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-ink/12"
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", !service.isActive && "text-muted")}>
                    {service.name}
                    {!service.isActive && (
                      <span className="ml-2 text-xs font-normal text-muted">not offered</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted tabular-nums">
                    {service.durationMin} min
                    {service.priceMinor > 0 && ` · ${money(service.priceMinor, service.currency)}`}
                    {service.bufferAfterMin > 0 && ` · ${service.bufferAfterMin} min to reset`}
                  </p>
                </div>
                {canManage && (
                  <Button variant="secondary" size="sm" onClick={() => setEditingId(service.id)}>
                    Edit
                  </Button>
                )}
              </Card>
            ),
          )}
        </div>
      )}
    </>
  );
}

function ServiceForm({
  service,
  onSave,
  onDelete,
  onCancel,
}: {
  service?: Service;
  onSave: (changes: Partial<Service> & { name?: string }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: service?.name ?? "",
    durationMin: service?.durationMin ?? 30,
    price: ((service?.priceMinor ?? 0) / 100).toFixed(2),
    bufferAfterMin: service?.bufferAfterMin ?? 0,
    isActive: service?.isActive ?? true,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            placeholder="Men's cut"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="How long it takes">
          <Select
            className="w-full"
            value={draft.durationMin}
            onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })}
          >
            {DURATIONS.map((min) => (
              <option key={min} value={min}>
                {min} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Price (${service?.currency ?? "USD"})`} hint="Leave at 0 to hide it">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
        </Field>
        <Field label="Gap afterwards" hint="Time to clean up before the next one">
          <Select
            className="w-full"
            value={draft.bufferAfterMin}
            onChange={(e) => setDraft({ ...draft, bufferAfterMin: Number(e.target.value) })}
          >
            {BUFFERS.map((min) => (
              <option key={min} value={min}>
                {min === 0 ? "None" : `${min} min`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Switch
        checked={draft.isActive}
        onChange={(next) => setDraft({ ...draft, isActive: next })}
        label="Offer this on the booking page"
      />

      <div className="flex items-center gap-2 border-t border-line-soft pt-4">
        <Button
          size="sm"
          disabled={!draft.name}
          onClick={() =>
            onSave({
              name: draft.name,
              durationMin: draft.durationMin,
              priceMinor: Math.round(Number(draft.price || 0) * 100),
              bufferAfterMin: draft.bufferAfterMin,
              isActive: draft.isActive,
            })
          }
        >
          {service ? "Save changes" : "Add service"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
