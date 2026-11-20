import { StorageService } from "./storage.service";

const put = jest.fn();
jest.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => put(...args) }));

describe("StorageService (Vercel Blob only)", () => {
  const svc = new StorageService();
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    put.mockReset();
  });

  it("without BLOB_READ_WRITE_TOKEN nothing is stored and nothing is attempted", async () => {
    expect(svc.enabled).toBe(false);
    expect(await svc.put("lessons/L1/source.pdf", Buffer.from("x"))).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("with the token the original goes to Blob under lessons/{id}/source.{ext}", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "t";
    put.mockResolvedValue({ url: "https://blob.example/x" });
    const buf = Buffer.from("pdf");
    expect(await svc.put(StorageService.keyFor("L1", "PDF"), buf)).toEqual({ key: "lessons/L1/source.pdf", url: "https://blob.example/x" });
    expect(put).toHaveBeenCalledWith("lessons/L1/source.pdf", buf, { access: "public", addRandomSuffix: true });
  });

  it("a Blob failure never blocks the lesson", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "t";
    put.mockRejectedValue(new Error("blob down"));
    expect(await svc.put("k", Buffer.from("x"))).toBeNull();
  });

  it("keys are sanitized", () => {
    expect(StorageService.keyFor("L1", "../x!")).toBe("lessons/L1/source.x");
    expect(StorageService.keyFor("L1", "")).toBe("lessons/L1/source.bin");
  });
});
