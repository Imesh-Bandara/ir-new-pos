import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  ArrowLeft, 
  Save, 
  ScanLine, 
  Barcode as BarcodeIcon, 
  Keyboard, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  RefreshCw,
  ExternalLink,
  Zap,
  Camera,
  X
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { Html5Qrcode } from "html5-qrcode";
import { ProductAPI, Category, Brand, Unit, Product } from "../../features/products/product.api";
import { ProductSchema, ProductFormValues } from "../../features/products/product.schema";
import { useAuthStore } from "../../features/auth/auth.store";
import { useBarcodeScanner } from "../../features/pos/useBarcodeScanner";
import toast from "react-hot-toast";

// Synthesize a crisp POS confirmation beep using Web Audio API
function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1900, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    // Ignore audio permission restrictions
  }
}

export function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const { token } = useAuthStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Barcode entry mode: 'scan' | 'type'
  const [barcodeMode, setBarcodeMode] = useState<"scan" | "type">("scan");
  const [scannerLiveInput, setScannerLiveInput] = useState("");
  const [scanSuccessFlash, setScanSuccessFlash] = useState(false);
  const [isCheckingBarcode, setIsCheckingBarcode] = useState(false);
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);

  // Camera scanner modal state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const nameEnInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(ProductSchema),
    defaultValues: {
      status: "ACTIVE",
      cost_price: 0,
      selling_price: 0,
      tax_rate: 0,
      discount_amount: 0,
      minimum_stock: 0,
      current_stock: 0,
    }
  });

  const currentBarcode = watch("barcode") || "";
  const currentSku = watch("sku") || "";

  // Render authentic barcode stripes onto SVG using JsBarcode library
  useEffect(() => {
    if (barcodeSvgRef.current) {
      try {
        const displayCode = currentBarcode || "4792023001824";
        JsBarcode(barcodeSvgRef.current, displayCode, {
          format: "CODE128",
          lineColor: "#1d4ed8", // deep royal blue
          background: "transparent",
          width: 1.8,
          height: 48,
          displayValue: true,
          fontSize: 11,
          font: "monospace",
          fontOptions: "bold",
          textMargin: 4,
          margin: 0
        });
      } catch (err) {
        // Fallback gracefully if invalid characters
      }
    }
  }, [currentBarcode, barcodeMode]);

  useEffect(() => {
    async function loadData() {
      if (!token) return;
      try {
        const [cats, brnds, unts] = await Promise.all([
          ProductAPI.getCategories(token),
          ProductAPI.getBrands(token),
          ProductAPI.getUnits(token)
        ]);
        setCategories(cats);
        setBrands(brnds);
        setUnits(unts);

        if (isEditMode && id) {
          const product = await ProductAPI.getProduct(token, id);
          reset({
            ...product,
            status: product.status as "ACTIVE" | "INACTIVE",
            cost_price: product.cost_price / 100,
            selling_price: product.selling_price / 100,
            wholesale_price: product.wholesale_price ? product.wholesale_price / 100 : undefined,
            discount_amount: product.discount_amount / 100,
            tax_rate: product.tax_rate / 100,
          });
        }
      } catch (e: any) {
        console.error("Failed to load data", e);
        setError("Failed to load product data.");
      }
    }
    loadData();
  }, [token, id, isEditMode, reset]);

  // Handle barcode lookup and auto-fill logic
  const handleBarcodeIdentified = async (scannedCode: string) => {
    const code = scannedCode.trim();
    if (!code) return;

    setValue("barcode", code, { shouldValidate: true });
    setScannerLiveInput(code);
    playScanBeep();
    setScanSuccessFlash(true);
    setTimeout(() => setScanSuccessFlash(false), 1200);

    if (!token) return;

    setIsCheckingBarcode(true);
    try {
      const res = await ProductAPI.getProducts(token, { search: code, limit: 10, offset: 0 });
      const exactMatch = res.items.find(p => p.barcode === code && p.id !== id);

      if (exactMatch) {
        setExistingProduct(exactMatch);
        toast(() => (
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-gray-900">Existing barcode match found!</span>
            <span className="text-xs text-gray-600">{exactMatch.name_en}</span>
          </div>
        ), { icon: "ℹ️" });
      } else {
        setExistingProduct(null);
        // If SKU is empty, suggest an auto-generated SKU
        if (!currentSku) {
          const generatedSku = `SKU-${code.slice(-6).toUpperCase()}`;
          setValue("sku", generatedSku, { shouldValidate: true });
        }
        toast.success(`Barcode ${code} recorded!`);
        // Smoothly focus on Product Name for next input
        setTimeout(() => {
          nameEnInputRef.current?.focus();
        }, 150);
      }
    } catch (e) {
      console.error("Error searching barcode", e);
    } finally {
      setIsCheckingBarcode(false);
    }
  };

  // Hardware barcode scanner listener
  useBarcodeScanner((barcode) => {
    if (barcodeMode === "scan" && !showCameraScanner) {
      handleBarcodeIdentified(barcode);
    }
  });

  const handleSimulateScan = () => {
    const sampleBarcodes = ["4792023001824", "8901030382341", "7613035624719", "4791005001202", "012345678905"];
    const randomCode = sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];
    handleBarcodeIdentified(randomCode);
  };

  const handleAutoGenerateSku = () => {
    if (currentBarcode) {
      setValue("sku", `SKU-${currentBarcode.slice(-6).toUpperCase()}`, { shouldValidate: true });
    } else {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      setValue("sku", `SKU-${randomDigits}`, { shouldValidate: true });
    }
    toast.success("Generated SKU");
  };

  const handleLoadExistingProductData = () => {
    if (!existingProduct) return;
    setValue("name_en", existingProduct.name_en);
    setValue("name_si", existingProduct.name_si || "");
    if (existingProduct.category_id) setValue("category_id", existingProduct.category_id);
    if (existingProduct.brand_id) setValue("brand_id", existingProduct.brand_id);
    if (existingProduct.unit_id) setValue("unit_id", existingProduct.unit_id);
    setValue("cost_price", existingProduct.cost_price / 100);
    setValue("selling_price", existingProduct.selling_price / 100);
    if (existingProduct.wholesale_price) setValue("wholesale_price", existingProduct.wholesale_price / 100);
    setValue("minimum_stock", existingProduct.minimum_stock);
    toast.success("Loaded product data into form");
  };

  // Camera Barcode Scanner lifecycle
  const startCameraScanner = async () => {
    setShowCameraScanner(true);
    setCameraError(null);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("camera-barcode-reader");
        html5QrCodeRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: { width: 280, height: 160 },
          },
          (decodedText) => {
            handleBarcodeIdentified(decodedText);
            stopCameraScanner();
          },
          () => {
            // Frame scan callback without match
          }
        );
      } catch (err: any) {
        console.error("Camera scanner error", err);
        setCameraError(err?.message || "Could not access camera. Please verify permissions.");
      }
    }, 200);
  };

  const stopCameraScanner = () => {
    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.stop().then(() => {
          html5QrCodeRef.current?.clear();
          html5QrCodeRef.current = null;
        }).catch(() => {
          html5QrCodeRef.current = null;
        });
      } catch (e) {
        html5QrCodeRef.current = null;
      }
    }
    setShowCameraScanner(false);
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...data,
        cost_price: Math.round(data.cost_price * 100),
        selling_price: Math.round(data.selling_price * 100),
        wholesale_price: data.wholesale_price ? Math.round(data.wholesale_price * 100) : undefined,
        discount_amount: Math.round(data.discount_amount * 100),
        tax_rate: Math.round(data.tax_rate * 100),
        id: id || "",
      };
      
      if (isEditMode) {
        await ProductAPI.updateProduct(token, payload);
      } else {
        await ProductAPI.createProduct(token, payload);
      }
      navigate("/products");
    } catch (err: any) {
      setError(typeof err === "string" ? err : err.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  const { ref: nameEnRef, ...nameEnRegister } = register("name_en");

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/products")} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{isEditMode ? "Edit Product" : "New Product"}</h2>
          <p className="text-xs text-gray-500">Scan product packaging or enter details manually</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-lg flex items-center gap-2">
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* ======================================================== */}
        {/* WHITE & BLUE BARCODE & PRODUCT IDENTIFICATION SECTION */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-blue-100/90 overflow-hidden transition-all hover:border-blue-200">
          
          {/* Card Header with Blue & White Theme */}
          <div className="p-5 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shadow-blue-500/20">
                <BarcodeIcon size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  Barcode & Product Identification
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200/70">
                    Dual Mode
                  </span>
                </h3>
                <p className="text-xs text-gray-500">
                  External manufacturer barcode and internal store SKU
                </p>
              </div>
            </div>

            {/* SELECTION BOX: BLUE & WHITE ACCENT PILLS */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setBarcodeMode("scan");
                  setTimeout(() => scannerInputRef.current?.focus(), 50);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  barcodeMode === "scan"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <ScanLine size={15} />
                <span>Barcode Scanner</span>
                <span className={`w-2 h-2 rounded-full ${barcodeMode === "scan" ? "bg-white animate-pulse" : "bg-blue-600"}`} />
              </button>

              <button
                type="button"
                onClick={() => setBarcodeMode("type")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  barcodeMode === "type"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <Keyboard size={15} />
                <span>Manual Entry</span>
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            
            {/* SCANNER VIEWPORT: ELEGANT WHITE & BLUE CARD */}
            {barcodeMode === "scan" ? (
              <div className={`relative rounded-2xl border-2 transition-all p-5 overflow-hidden shadow-xs ${
                scanSuccessFlash 
                  ? "bg-blue-100/60 border-blue-500 shadow-blue-200" 
                  : "bg-gradient-to-br from-blue-50/70 via-white to-blue-50/50 border-blue-200/90"
              }`}>
                
                {/* Visual Viewfinder Reticle Corners in Royal Blue */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-blue-600 rounded-tl-md" />
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-blue-600 rounded-tr-md" />
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-blue-600 rounded-bl-md" />
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-blue-600 rounded-br-md" />

                {/* Laser Sweep Beam Animation in Electric Royal Blue */}
                <div className="absolute inset-x-6 top-1 bottom-1 pointer-events-none overflow-hidden">
                  <div className="absolute left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-blue-600 to-transparent shadow-[0_0_14px_rgba(37,99,235,1),0_0_6px_rgba(59,130,246,1)] animate-scan-laser" />
                </div>

                <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                  
                  {/* Left: Barcode Scanner Graphic with Real JsBarcode library */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                    <div className="relative bg-white/95 border border-blue-200 rounded-xl px-4 py-2.5 shadow-2xs flex items-center justify-center">
                      <svg ref={barcodeSvgRef} className="max-w-[190px] h-auto drop-shadow-xs" />
                    </div>

                    <div>
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <span className="font-bold text-sm text-gray-800">
                          {scanSuccessFlash ? "Barcode Scanned Successfully!" : "Scanner Active & Ready"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                          LIVE
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        Aim your physical barcode scanner at any packaging, or use your Mac camera.
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions & Camera Scanner Trigger */}
                  <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-end w-full lg:w-auto">
                    
                    {/* Scanner Input Trap */}
                    <div className="relative w-44 sm:w-48">
                      <input
                        ref={scannerInputRef}
                        type="text"
                        placeholder="Scan or enter code..."
                        value={scannerLiveInput}
                        onChange={(e) => setScannerLiveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleBarcodeIdentified(scannerLiveInput);
                          }
                        }}
                        className="w-full bg-white text-gray-900 placeholder-gray-400 border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleBarcodeIdentified(scannerLiveInput)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs shadow-blue-500/20 shrink-0"
                    >
                      Apply
                    </button>

                    <button
                      type="button"
                      onClick={handleSimulateScan}
                      title="Test scanning without physical scanner"
                      className="px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 transition-all shadow-2xs shrink-0 flex items-center gap-1.5"
                    >
                      <Zap size={13} className="text-amber-500" />
                      <span>Test Scan</span>
                    </button>

                    <button
                      type="button"
                      onClick={startCameraScanner}
                      title="Scan using your Mac camera"
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-xl border border-blue-200 transition-all shadow-2xs shrink-0 flex items-center gap-1.5"
                    >
                      <Camera size={14} className="text-blue-600" />
                      <span>Camera Scanner</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* BARCODE & SKU INPUT GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">
                    Product Barcode
                  </label>
                  {currentBarcode && (
                    <span className="text-[11px] text-blue-700 font-semibold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      <CheckCircle2 size={13} className="text-blue-600" />
                      {currentBarcode.length}-digit code
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input 
                    {...register("barcode")} 
                    placeholder="e.g. 4791234567890"
                    onBlur={(e) => {
                      if (e.target.value) handleBarcodeIdentified(e.target.value);
                    }}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm bg-white shadow-2xs transition-all" 
                  />
                  <BarcodeIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  {isCheckingBarcode && (
                    <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" size={16} />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Universal manufacturer barcode scanned at the checkout counter.
                </p>
                {errors.barcode && <span className="text-red-500 text-xs mt-1 block">{errors.barcode.message}</span>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">
                    SKU (Internal Code)
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateSku}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles size={12} />
                    Auto-Generate
                  </button>
                </div>
                <input 
                  {...register("sku")} 
                  placeholder="e.g. BEV-COKE-500ML"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono uppercase text-sm bg-white shadow-2xs transition-all" 
                />
                <p className="text-xs text-gray-500 mt-1">
                  Internal store identifier used for shelving, warehouse, and inventory.
                </p>
                {errors.sku && <span className="text-red-500 text-xs mt-1 block">{errors.sku.message}</span>}
              </div>
            </div>

            {/* EXISTING PRODUCT DETECTED BANNER */}
            {existingProduct && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">
                      Product already exists with this barcode!
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5">
                      <strong>{existingProduct.name_en}</strong> — Price: Rs. {(existingProduct.selling_price / 100).toFixed(2)} | Stock: {existingProduct.current_stock}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={handleLoadExistingProductData}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <RefreshCw size={13} />
                    Auto-fill Form
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/products/${existingProduct.id}/edit`)}
                    className="px-3.5 py-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink size={13} />
                    Edit Item
                  </button>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* ======================================================== */}
        {/* CORE PRODUCT NAMES */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-6 space-y-4">
          <h3 className="text-base font-bold text-gray-800 border-b pb-2">Product Names</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name (English) *</label>
              <input 
                {...nameEnRegister}
                ref={(e) => {
                  nameEnRef(e);
                  (nameEnInputRef as any).current = e;
                }}
                placeholder="e.g. Coca-Cola 500ml"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
              />
              {errors.name_en && <span className="text-red-500 text-xs mt-1 block">{errors.name_en.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name (Sinhala)</label>
              <input 
                {...register("name_si")} 
                placeholder="e.g. කොකා කෝලා 500මිලි"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
              />
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* CATEGORIZATION */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-6 space-y-4">
          <h3 className="text-base font-bold text-gray-800 border-b pb-2">Categorization</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select {...register("category_id")} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
              {errors.category_id && <span className="text-red-500 text-xs mt-1 block">{errors.category_id.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <select {...register("brand_id")} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                <option value="">Select Brand</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name_en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select {...register("unit_id")} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                <option value="">Select Unit</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name_en} {u.abbreviation ? `(${u.abbreviation})` : ""}</option>)}
              </select>
              {errors.unit_id && <span className="text-red-500 text-xs mt-1 block">{errors.unit_id.message}</span>}
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* PRICING */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-6 space-y-4">
          <h3 className="text-base font-bold text-gray-800 border-b pb-2">Pricing (Rs.)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price *</label>
              <input type="number" step="0.01" {...register("cost_price", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
              {errors.cost_price && <span className="text-red-500 text-xs mt-1 block">{errors.cost_price.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price *</label>
              <input type="number" step="0.01" {...register("selling_price", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
              {errors.selling_price && <span className="text-red-500 text-xs mt-1 block">{errors.selling_price.message}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale Price</label>
              <input type="number" step="0.01" {...register("wholesale_price", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Amount</label>
              <input type="number" step="0.01" {...register("discount_amount", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" {...register("tax_rate", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* INVENTORY RULES */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-6 space-y-4">
          <h3 className="text-base font-bold text-gray-800 border-b pb-2">Inventory Rules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock (Reorder Level)</label>
              <input type="number" {...register("minimum_stock", { valueAsNumber: true })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select {...register("status")} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
        </section>

        {/* SUBMIT BUTTONS */}
        <div className="pt-4 flex justify-end gap-4 border-t border-gray-200">
          <button type="button" onClick={() => navigate("/products")} className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 rounded-xl text-white font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm shadow-xs shadow-blue-500/20">
            <Save size={18} />
            {loading ? "Saving..." : "Save Product"}
          </button>
        </div>

      </form>

      {/* ======================================================== */}
      {/* CAMERA BARCODE SCANNER MODAL */}
      {/* ======================================================== */}
      {showCameraScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 max-w-md w-full p-6 space-y-4 relative">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Camera size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Camera Barcode Scanner</h3>
              </div>
              <button
                type="button"
                onClick={stopCameraScanner}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs space-y-2">
                <p className="font-semibold">{cameraError}</p>
                <p>Ensure you have granted camera permissions in macOS System Settings &gt; Privacy &amp; Security &gt; Camera.</p>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-slate-900 border-2 border-blue-400 flex flex-col items-center justify-center min-h-[260px]">
                {/* Scanner container for html5-qrcode */}
                <div id="camera-barcode-reader" className="w-full h-full" />
                <p className="text-xs text-white/80 py-2 text-center bg-black/50 w-full absolute bottom-0">
                  Align product barcode inside the camera box
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={stopCameraScanner}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
