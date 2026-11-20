/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A lazily-mocked Prisma client for service unit tests: `db.lesson.findFirst` is a jest.fn created on first use.
 * `$transaction` runs callbacks against the same mock and resolves arrays.
 */
export type Mocked = any;

export function mockPrisma(): Mocked {
  const models = new Map<string, any>();
  const tx = jest.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (c: unknown) => unknown)(proxy) : Promise.all(arg as unknown[])));
  const raw = jest.fn();
  const proxy: Mocked = new Proxy(
    {},
    {
      get(_t, name: string) {
        if (name === "$transaction") return tx;
        if (name === "$queryRaw") return raw;
        if (!models.has(name)) {
          const methods = new Map<string, jest.Mock>();
          models.set(
            name,
            new Proxy(
              {},
              {
                get(_m, method: string) {
                  if (!methods.has(method)) methods.set(method, jest.fn());
                  return methods.get(method);
                },
              },
            ),
          );
        }
        return models.get(name);
      },
    },
  );
  return proxy;
}
