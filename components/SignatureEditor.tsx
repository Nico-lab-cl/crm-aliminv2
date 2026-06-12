'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Save, 
  Copy, 
  Check, 
  User, 
  Phone as PhoneIcon, 
  Share2, 
  Palette, 
  Eye, 
  FileText, 
  AlertCircle 
} from 'lucide-react';

// Tipos de datos
interface SignatureConfig {
  name: string;
  personal_info: {
    name: string;
    job_title: string;
    department: string;
    company: string;
    logo_url: string;
    avatar_url: string;
  };
  contact_info: {
    email: string;
    phone: string;
    mobile: string;
    website: string;
    address: string;
  };
  social_links: {
    whatsapp: string;
    instagram: string;
    facebook: string;
    linkedin: string;
    youtube: string;
  };
  styling: {
    template_id: string; // 'modern_border' | 'two_column' | 'minimalist'
    primary_color: string;
    secondary_color: string;
    text_color: string;
    font_family: string; // 'Arial' | 'Helvetica' | 'Georgia' | 'Trebuchet MS'
  };
}

interface SignatureEditorProps {
  initialData?: SignatureConfig & { id?: string };
}

const DEFAULT_CONFIG: SignatureConfig = {
  name: '',
  personal_info: {
    name: 'Omar Costa',
    job_title: 'Asesor de Ventas',
    department: 'Área Comercial',
    company: 'Alimin Inmobiliaria',
    logo_url: 'https://aliminspa.cl/wp-content/uploads/2023/04/Logo-Alimin.png', // Logo de Alimin
    avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150', // Headshot
  },
  contact_info: {
    email: 'omar.costa@aliminspa.cl',
    phone: '+56 2 2123 4587',
    mobile: '+56 9 9876 5432',
    website: 'https://aliminspa.cl',
    address: 'Av. Las Condes 1234, Oficina 501, Santiago',
  },
  social_links: {
    whatsapp: '56998765432',
    instagram: 'https://instagram.com/alimin.lomasdelmar',
    facebook: 'https://facebook.com/alimin.lomasdelmar',
    linkedin: 'https://linkedin.com/company/alimin',
    youtube: '',
  },
  styling: {
    template_id: 'modern_border',
    primary_color: '#2d544c', // Verde Alimin
    secondary_color: '#516f90',
    text_color: '#33475b',
    font_family: 'Arial',
  }
};

// CDN URLs para iconos de redes sociales (limpios y estables)
const SOCIAL_ICONS = {
  whatsapp: 'https://cdn-icons-png.flaticon.com/32/733/733585.png',
  instagram: 'https://cdn-icons-png.flaticon.com/32/2111/2111463.png',
  facebook: 'https://cdn-icons-png.flaticon.com/32/733/733547.png',
  linkedin: 'https://cdn-icons-png.flaticon.com/32/3536/3536505.png',
  youtube: 'https://cdn-icons-png.flaticon.com/32/3938/3938026.png',
};

export default function SignatureEditor({ initialData }: SignatureEditorProps) {
  const router = useRouter();
  const [config, setConfig] = useState<SignatureConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'personal' | 'contact' | 'social' | 'styling'>('personal');
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      // Fusionar con defaults para evitar campos undefined
      setConfig({
        name: initialData.name || '',
        personal_info: { ...DEFAULT_CONFIG.personal_info, ...initialData.personal_info },
        contact_info: { ...DEFAULT_CONFIG.contact_info, ...initialData.contact_info },
        social_links: { ...DEFAULT_CONFIG.social_links, ...initialData.social_links },
        styling: { ...DEFAULT_CONFIG.styling, ...initialData.styling },
      });
    }
  }, [initialData]);

  // Utilidad para codificar en Base64 en el navegador de manera segura (con caracteres UTF-8)
  const safeBtoa = (str: string): string => {
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return btoa(str);
    }
  };

  // Generar URL de tracking o retornar URL cruda si está vacía
  const getTrackingUrl = (element: string, rawUrl: string) => {
    if (!rawUrl) return '';
    
    // Tratamiento especial de WhatsApp si es un número simple
    let finalUrl = rawUrl;
    if (element === 'whatsapp' && !rawUrl.startsWith('http')) {
      finalUrl = `https://wa.me/${rawUrl.replace(/[^0-9]/g, '')}`;
    } else if (element === 'email' && !rawUrl.startsWith('mailto:')) {
      finalUrl = `mailto:${rawUrl}`;
    } else if (element === 'phone' && !rawUrl.startsWith('tel:')) {
      finalUrl = `tel:${rawUrl.replace(/\s+/g, '')}`;
    } else if (element === 'mobile' && !rawUrl.startsWith('tel:')) {
      finalUrl = `tel:${rawUrl.replace(/\s+/g, '')}`;
    }

    // Retorna URL estructurada con placeholders
    return `__TRACKING_ORIGIN__/api/sig/click?sid=__SIGNATURE_ID__&el=${element}&url=${safeBtoa(finalUrl)}`;
  };

  // Generador de la plantilla HTML definitiva
  const generateHtml = (isLivePreview = false) => {
    const { personal_info, contact_info, social_links, styling } = config;
    const sigId = initialData?.id || '__SIGNATURE_ID__';
    const origin = isLivePreview ? (typeof window !== 'undefined' ? window.location.origin : '') : '__TRACKING_ORIGIN__';
    
    // Reemplaza origin y sigId si es para la vista previa
    const getLink = (element: string, url: string) => {
      let tracked = getTrackingUrl(element, url);
      if (isLivePreview) {
        tracked = tracked
          .replaceAll('__TRACKING_ORIGIN__', origin)
          .replaceAll('__SIGNATURE_ID__', sigId);
      }
      return tracked || '#';
    };

    const font = styling.font_family;
    const primary = styling.primary_color;
    const secondary = styling.secondary_color;
    const text = styling.text_color;

    // Foto de Perfil (Avatar)
    const avatarHtml = personal_info.avatar_url 
      ? `<img src="${personal_info.avatar_url}" alt="${personal_info.name}" width="75" height="75" style="width: 75px; height: 75px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #cbd6e2;" />`
      : '';

    // Logo de la Empresa
    const logoHtml = personal_info.logo_url
      ? `<img src="${personal_info.logo_url}" alt="Logo" height="24" style="height: 24px; max-height: 24px; max-width: 110px; display: block; object-fit: contain; border: 0;" />`
      : '';

    // Enlaces de contacto
    const emailHtml = contact_info.email 
      ? `<span style="white-space: nowrap;"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">E:</span><a href="${getLink('email', contact_info.email)}" style="color: ${text}; text-decoration: none;">${contact_info.email}</a></span>`
      : '';

    const phoneHtml = contact_info.phone 
      ? `<span style="white-space: nowrap;"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">T:</span><a href="${getLink('phone', contact_info.phone)}" style="color: ${text}; text-decoration: none;">${contact_info.phone}</a></span>`
      : '';

    const mobileHtml = contact_info.mobile 
      ? `<span style="white-space: nowrap;"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">M:</span><a href="${getLink('mobile', contact_info.mobile)}" style="color: ${text}; text-decoration: none;">${contact_info.mobile}</a></span>`
      : '';

    const websiteHtml = contact_info.website 
      ? `<span style="white-space: nowrap;"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">W:</span><a href="${getLink('website', contact_info.website)}" style="color: ${primary}; text-decoration: none; font-weight: bold;">${contact_info.website.replace(/^https?:\/\/(www\.)?/, '')}</a></span>`
      : '';

    // Líneas de contactos agrupadas horizontalmente
    const contactsLine1 = [phoneHtml, mobileHtml].filter(Boolean).join('<span style="color: #cbd6e2; margin: 0 8px;">|</span>');
    const contactsLine2 = [emailHtml, websiteHtml].filter(Boolean).join('<span style="color: #cbd6e2; margin: 0 8px;">|</span>');

    // Redes Sociales
    const socialLinksHtml = Object.entries(social_links)
      .filter(([_, url]) => !!url)
      .map(([key, url]) => {
        const iconUrl = SOCIAL_ICONS[key as keyof typeof SOCIAL_ICONS];
        return `
          <a href="${getLink(key, url)}" style="display: inline-block; margin-right: 6px; text-decoration: none;" target="_blank">
            <img src="${iconUrl}" alt="${key}" width="18" height="18" style="width: 18px; height: 18px; border: 0; display: block;" />
          </a>
        `;
      }).join('');

    // Fila inferior para redes sociales y logo (lado a lado, muy elegante)
    const bottomRowHtml = (socialLinksHtml || logoHtml)
      ? `<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 10px; width: 100%;">
          <tr>
            ${socialLinksHtml ? `<td style="padding: 0; vertical-align: middle;">${socialLinksHtml}</td>` : ''}
            ${logoHtml ? `<td style="padding: 0; text-align: right; vertical-align: middle;" align="right">${logoHtml}</td>` : ''}
          </tr>
         </table>`
      : '';

    // ============================================
    // PLANTILLA 1: PREMIUM EXECUTIVE (Borde de Acento Fino + Foto & Logo)
    // ============================================
    if (styling.template_id === 'modern_border') {
      return `
        <table cellpadding="0" cellspacing="0" style="font-family: ${font}, sans-serif; font-size: 13px; color: ${text}; line-height: 1.35; border-collapse: collapse; text-align: left; background-color: transparent;">
          <tr>
            <!-- Columna Izquierda: Solo Foto de Perfil -->
            ${avatarHtml ? `<td style="padding-right: 18px; vertical-align: top; text-align: center;" valign="top" align="center">${avatarHtml}</td>` : ''}
            
            <!-- Línea Divisoria Vertical Fina -->
            <td style="width: 1px; background-color: #e2e8f0; padding: 0;" width="1"></td>
            
            <!-- Columna Derecha: Datos, Redes y Logo -->
            <td style="padding-left: 18px; vertical-align: top;" valign="top">
              <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr>
                  <td style="padding: 0 0 4px 0;">
                    <div style="font-size: 15px; font-weight: bold; color: ${primary}; margin: 0; line-height: 1.2;">${personal_info.name}</div>
                    <div style="font-size: 11.5px; color: ${secondary}; font-style: italic; margin: 1px 0 2px 0;">
                      ${personal_info.job_title}${personal_info.department ? ` &bull; ${personal_info.department}` : ''}
                    </div>
                    <div style="font-size: 11px; font-weight: bold; color: ${text}; margin: 2px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">${personal_info.company}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0;">
                    <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 11.5px; color: ${text};">
                      ${contactsLine1 ? `<tr><td style="padding: 2px 0;">${contactsLine1}</td></tr>` : ''}
                      ${contactsLine2 ? `<tr><td style="padding: 2px 0;">${contactsLine2}</td></tr>` : ''}
                      ${contact_info.address ? `<tr><td style="padding: 2px 0; font-size: 10.5px; color: ${secondary};"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">A:</span>${contact_info.address}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
                ${bottomRowHtml ? `
                <tr>
                  <td style="padding: 0;">
                    ${bottomRowHtml}
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
        </table>
      `.trim();
    }

    // ============================================
    // PLANTILLA 2: TWO COLUMNS CARD (Formato Tarjeta en Columnas)
    // ============================================
    if (styling.template_id === 'two_column') {
      return `
        <table cellpadding="0" cellspacing="0" style="font-family: ${font}, sans-serif; font-size: 13px; color: ${text}; line-height: 1.35; border-collapse: collapse; text-align: left;">
          <tr>
            <!-- Columna Izquierda: Solo Foto de Perfil -->
            ${avatarHtml ? `<td style="padding-right: 20px; vertical-align: top; text-align: center; width: 75px;" width="75" align="center" valign="top">${avatarHtml}</td>` : ''}
            
            <!-- Columna Derecha: Datos, Redes y Logo -->
            <td style="vertical-align: top; padding-left: 10px;" valign="top">
              <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr>
                  <td style="padding: 0 0 8px 0;">
                    <div style="font-size: 16px; font-weight: bold; color: ${primary}; margin: 0 0 1px 0; line-height: 1.2;">${personal_info.name}</div>
                    <div style="font-size: 12px; font-weight: 600; color: ${secondary}; margin: 0 0 3px 0;">${personal_info.job_title}</div>
                    <div style="font-size: 11px; color: ${text}; font-weight: bold; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">${personal_info.company}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0 0 0; border-top: 1px solid #e2e8f0;">
                    <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 11.5px; color: ${text};">
                      ${contactsLine1 ? `<tr><td style="padding: 1px 0;">${contactsLine1}</td></tr>` : ''}
                      ${contactsLine2 ? `<tr><td style="padding: 1px 0;">${contactsLine2}</td></tr>` : ''}
                      ${contact_info.address ? `<tr><td style="padding: 1.5px 0; font-size: 10.5px; color: ${secondary};"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">A:</span>${contact_info.address}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
                ${bottomRowHtml ? `
                <tr>
                  <td style="padding: 0;">
                    ${bottomRowHtml}
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
        </table>
      `.trim();
    }

    // ============================================
    // PLANTILLA 3: MINIMALIST STACKED (Limpio y Apilado)
    // ============================================
    const leftLogoBlock = logoHtml 
      ? `<td style="padding-right: 18px; vertical-align: middle; text-align: center;" valign="middle" align="center">
          ${logoHtml}
         </td>
         <td style="width: 1px; background-color: #e2e8f0; padding: 0;" width="1"></td>`
      : '';

    return `
      <table cellpadding="0" cellspacing="0" style="font-family: ${font}, sans-serif; font-size: 13px; color: ${text}; line-height: 1.35; border-collapse: collapse; text-align: left; min-width: 280px;">
        <tr>
          ${leftLogoBlock}
          <td style="${logoHtml ? 'padding-left: 18px;' : 'padding: 0;'} vertical-align: top;" valign="top">
            <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td style="padding: 0 0 6px 0;">
                  <div style="font-size: 16px; font-weight: bold; color: ${primary}; margin: 0 0 1px 0; line-height: 1.2;">${personal_info.name}</div>
                  <div style="font-size: 11.5px; color: ${secondary}; margin: 0 0 2px 0;">${personal_info.job_title} | ${personal_info.department}</div>
                  <div style="font-size: 11px; font-weight: bold; color: ${text}; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">${personal_info.company}</div>
                </td>
              </tr>
              <tr>
                <!-- Línea Separadora Horizontal Fina -->
                <td style="height: 1px; background-color: ${primary}; padding: 0; font-size: 1px; line-height: 1px;" height="1"></td>
              </tr>
              <tr>
                <td style="padding: 6px 0 0 0;">
                  <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 11.5px; color: ${text};">
                    ${contactsLine1 ? `<tr><td style="padding: 1px 0;">${contactsLine1}</td></tr>` : ''}
                    ${contactsLine2 ? `<tr><td style="padding: 1px 0;">${contactsLine2}</td></tr>` : ''}
                    ${contact_info.address ? `<tr><td style="padding: 1.5px 0; font-size: 10.5px; color: ${secondary};"><span style="color: ${primary}; font-weight: bold; margin-right: 3px;">A:</span>${contact_info.address}</td></tr>` : ''}
                  </table>
                </td>
              </tr>
              ${socialLinksHtml ? `
              <tr>
                <td style="padding-top: 8px;">
                  <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                    <tr>
                      <td style="padding: 0;">${socialLinksHtml}</td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
    `.trim();
  };

  // Guardar firma en la base de datos
  const handleSave = async () => {
    if (!config.name.trim()) {
      alert('Por favor, ingresa un nombre para identificar esta firma.');
      return;
    }

    setIsSaving(true);
    const htmlContent = generateHtml(false);

    const payload = {
      name: config.name,
      personal_info: config.personal_info,
      contact_info: config.contact_info,
      social_links: config.social_links,
      styling: config.styling,
      html_content: htmlContent
    };

    try {
      const url = initialData?.id 
        ? `/api/signatures/${initialData.id}` 
        : '/api/signatures';
      const method = initialData?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Error al guardar la firma de correo.');
      }

      alert(initialData?.id ? '¡Firma actualizada correctamente!' : '¡Firma creada y guardada con éxito!');
      router.push('/campaigns/signatures');
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('Error de red al intentar guardar la firma.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyHtml = async () => {
    try {
      const rawHtml = generateHtml(false);
      // Reemplaza origin actual
      const origin = window.location.origin;
      const compiledHtml = rawHtml
        .replaceAll('__TRACKING_ORIGIN__', origin)
        .replaceAll('__SIGNATURE_ID__', initialData?.id || 'simulated_sig_id');

      await navigator.clipboard.writeText(compiledHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    } catch (err) {
      console.error('Error al copiar HTML:', err);
    }
  };

  const handleCopyText = async () => {
    const { personal_info, contact_info } = config;
    const plainText = `
${personal_info.name}
${personal_info.job_title} | ${personal_info.department}
${personal_info.company}

E: ${contact_info.email}
T: ${contact_info.phone}
M: ${contact_info.mobile}
W: ${contact_info.website}
A: ${contact_info.address}
    `.trim();

    try {
      await navigator.clipboard.writeText(plainText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      console.error('Error al copiar Texto:', err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Botón de Atrás y Título */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.push('/campaigns/signatures')}
          className="p-2 hover:bg-[#eaf0f6] rounded-full transition-colors text-[#516f90]"
          title="Volver"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#33475b]">
            {initialData?.id ? 'Editar Firma de Email' : 'Crear Nueva Firma de Email'}
          </h1>
          <p className="text-xs text-[#516f90]">
            Modifica campos del formulario para ver el resultado renderizado en tiempo real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Lado Izquierdo: Formularios de Edición (Col 5) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-[#cbd6e2] shadow-sm overflow-hidden flex flex-col h-[700px]">
          {/* Nombre de la Firma */}
          <div className="p-4 border-b border-[#cbd6e2] bg-[#f6f9fc]">
            <label className="block text-xs font-bold text-[#516f90] uppercase tracking-wider mb-1">
              Nombre Interno de la Firma *
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Firma de Juan Pérez - Comercial"
              className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c] focus:border-transparent outline-none transition-all text-[#33475b] font-semibold"
            />
          </div>

          {/* Menú de Pestañas */}
          <div className="flex border-b border-[#cbd6e2] text-xs font-bold bg-[#f5f8fa]">
            <button
              onClick={() => setActiveTab('personal')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'personal' 
                  ? 'border-[#2d544c] text-[#2d544c] bg-white' 
                  : 'border-transparent text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Personal</span>
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'contact' 
                  ? 'border-[#2d544c] text-[#2d544c] bg-white' 
                  : 'border-transparent text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <PhoneIcon className="w-3.5 h-3.5" />
              <span>Contacto</span>
            </button>
            <button
              onClick={() => setActiveTab('social')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'social' 
                  ? 'border-[#2d544c] text-[#2d544c] bg-white' 
                  : 'border-transparent text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Redes</span>
            </button>
            <button
              onClick={() => setActiveTab('styling')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'styling' 
                  ? 'border-[#2d544c] text-[#2d544c] bg-white' 
                  : 'border-transparent text-[#516f90] hover:text-[#2d544c]'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Estilo</span>
            </button>
          </div>

          {/* Contenido Pestañas (Scrollable) */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {activeTab === 'personal' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    value={config.personal_info.name}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, name: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Cargo / Puesto</label>
                  <input
                    type="text"
                    value={config.personal_info.job_title}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, job_title: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Departamento</label>
                  <input
                    type="text"
                    value={config.personal_info.department}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, department: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Empresa</label>
                  <input
                    type="text"
                    value={config.personal_info.company}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, company: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Foto de Perfil (Avatar URL)</label>
                  <input
                    type="text"
                    value={config.personal_info.avatar_url}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, avatar_url: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b] mb-1"
                    placeholder="https://ejemplo.com/avatar.jpg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Logo de la Empresa (URL)</label>
                  <input
                    type="text"
                    value={config.personal_info.logo_url}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      personal_info: { ...prev.personal_info, logo_url: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                    placeholder="https://ejemplo.com/logo.png"
                  />
                  <p className="text-[10px] text-[#516f90] mt-1">Usa enlaces públicos directos. Deja en blanco si no deseas mostrarlos.</p>
                </div>
              </div>
            )}

            {activeTab === 'contact' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Email</label>
                  <input
                    type="email"
                    value={config.contact_info.email}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, email: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Teléfono Móvil (Celular)</label>
                  <input
                    type="text"
                    value={config.contact_info.mobile}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, mobile: e.target.value }
                    }))}
                    placeholder="Ej: +56 9 9876 5432"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Teléfono Fijo (Oficina)</label>
                  <input
                    type="text"
                    value={config.contact_info.phone}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, phone: e.target.value }
                    }))}
                    placeholder="Ej: +56 2 2123 4567"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Sitio Web</label>
                  <input
                    type="text"
                    value={config.contact_info.website}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, website: e.target.value }
                    }))}
                    placeholder="Ej: https://aliminspa.cl"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Dirección Física</label>
                  <input
                    type="text"
                    value={config.contact_info.address}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, address: e.target.value }
                    }))}
                    placeholder="Av. Las Condes 1234, Oficina 501, Santiago"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
              </div>
            )}

            {activeTab === 'social' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Número de WhatsApp</label>
                  <input
                    type="text"
                    value={config.social_links.whatsapp}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, whatsapp: e.target.value }
                    }))}
                    placeholder="Ej: 56998765432 (sin + ni espacios)"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Instagram URL</label>
                  <input
                    type="text"
                    value={config.social_links.instagram}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, instagram: e.target.value }
                    }))}
                    placeholder="https://instagram.com/usuario"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Facebook URL</label>
                  <input
                    type="text"
                    value={config.social_links.facebook}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, facebook: e.target.value }
                    }))}
                    placeholder="https://facebook.com/pagina"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">LinkedIn URL</label>
                  <input
                    type="text"
                    value={config.social_links.linkedin}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, linkedin: e.target.value }
                    }))}
                    placeholder="https://linkedin.com/in/usuario"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">YouTube URL</label>
                  <input
                    type="text"
                    value={config.social_links.youtube}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, youtube: e.target.value }
                    }))}
                    placeholder="https://youtube.com/c/canal"
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b]"
                  />
                </div>
              </div>
            )}

            {activeTab === 'styling' && (
              <div className="space-y-4">
                {/* Selector de Plantilla */}
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-2">Plantilla de Diseño</label>
                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      onClick={() => setConfig(prev => ({
                        ...prev,
                        styling: { ...prev.styling, template_id: 'modern_border' }
                      }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        config.styling.template_id === 'modern_border'
                          ? 'border-[#2d544c] bg-[#eaf0f6] ring-1 ring-[#2d544c]'
                          : 'border-[#cbd6e2] hover:bg-[#f6f9fc]'
                      }`}
                    >
                      <p className="font-bold text-xs text-[#33475b]">Borde de Acento Moderno</p>
                      <p className="text-[10px] text-[#516f90] mt-0.5">Foto izquierda, detalles a la derecha con borde vertical decorativo.</p>
                    </button>
                    <button
                      onClick={() => setConfig(prev => ({
                        ...prev,
                        styling: { ...prev.styling, template_id: 'two_column' }
                      }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        config.styling.template_id === 'two_column'
                          ? 'border-[#2d544c] bg-[#eaf0f6] ring-1 ring-[#2d544c]'
                          : 'border-[#cbd6e2] hover:bg-[#f6f9fc]'
                      }`}
                    >
                      <p className="font-bold text-xs text-[#33475b]">Tarjeta en Dos Columnas</p>
                      <p className="text-[10px] text-[#516f90] mt-0.5">Foto redonda a la izquierda con redes abajo, datos estructurados a la derecha.</p>
                    </button>
                    <button
                      onClick={() => setConfig(prev => ({
                        ...prev,
                        styling: { ...prev.styling, template_id: 'minimalist' }
                      }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        config.styling.template_id === 'minimalist'
                          ? 'border-[#2d544c] bg-[#eaf0f6] ring-1 ring-[#2d544c]'
                          : 'border-[#cbd6e2] hover:bg-[#f6f9fc]'
                      }`}
                    >
                      <p className="font-bold text-xs text-[#33475b]">Apilada Minimalista</p>
                      <p className="text-[10px] text-[#516f90] mt-0.5">Sin foto, textos limpios y línea divisoria horizontal de color.</p>
                    </button>
                  </div>
                </div>

                {/* Colores */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#516f90] uppercase mb-1">Color Principal</label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={config.styling.primary_color}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          styling: { ...prev.styling, primary_color: e.target.value }
                        }))}
                        className="w-8 h-8 rounded border border-[#cbd6e2] cursor-pointer"
                      />
                      <span className="text-xs font-mono text-[#516f90]">{config.styling.primary_color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#516f90] uppercase mb-1">Color Secundario</label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={config.styling.secondary_color}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          styling: { ...prev.styling, secondary_color: e.target.value }
                        }))}
                        className="w-8 h-8 rounded border border-[#cbd6e2] cursor-pointer"
                      />
                      <span className="text-xs font-mono text-[#516f90]">{config.styling.secondary_color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#516f90] uppercase mb-1">Color Texto</label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={config.styling.text_color}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          styling: { ...prev.styling, text_color: e.target.value }
                        }))}
                        className="w-8 h-8 rounded border border-[#cbd6e2] cursor-pointer"
                      />
                      <span className="text-xs font-mono text-[#516f90]">{config.styling.text_color}</span>
                    </div>
                  </div>
                </div>

                {/* Fuentes */}
                <div>
                  <label className="block text-xs font-bold text-[#516f90] uppercase mb-1">Tipografía</label>
                  <select
                    value={config.styling.font_family}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      styling: { ...prev.styling, font_family: e.target.value }
                    }))}
                    className="w-full bg-white border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2d544c] text-[#33475b] font-medium"
                  >
                    <option value="Arial">Arial (Por defecto)</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Botón Guardar en el Form */}
          <div className="p-4 border-t border-[#cbd6e2] bg-[#f6f9fc] flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-[#2d544c] hover:bg-[#203c36] disabled:bg-[#516f90] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all active:scale-95 text-xs uppercase"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Firma'}</span>
            </button>
          </div>
        </div>

        {/* Lado Derecho: Vista Previa y Acciones (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Panel de Vista Previa */}
          <div className="bg-white rounded-xl border border-[#cbd6e2] shadow-sm overflow-hidden flex flex-col h-[480px]">
            {/* Header Vista Previa */}
            <div className="p-4 border-b border-[#cbd6e2] flex justify-between items-center bg-[#f6f9fc]">
              <span className="text-xs font-bold text-[#516f90] uppercase tracking-wider flex items-center gap-1">
                <Eye className="w-4 h-4" />
                Vista Previa de Firma
              </span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                Visualización interactiva
              </span>
            </div>

            {/* Contenedor Iframe para aislar estilos HTML de la firma */}
            <div className="flex-1 p-8 flex items-center justify-center overflow-auto bg-[#f0f4f8]">
              <div 
                className="bg-white p-6 rounded-xl border border-[#cbd6e2] shadow-sm min-w-[320px] max-w-[550px]"
                dangerouslySetInnerHTML={{ __html: generateHtml(true) }}
              />
            </div>
          </div>

          {/* Caja de Acciones de Copiado */}
          <div className="bg-white rounded-xl border border-[#cbd6e2] p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-[#33475b] text-sm flex items-center gap-1.5 border-b border-[#cbd6e2] pb-3">
              <FileText className="w-4.5 h-4.5 text-[#2d544c]" />
              Exportar e Instalar la Firma
            </h3>
            <p className="text-xs text-[#516f90]">
              Elige cómo deseas exportar tu firma. Al copiar el código HTML, este incluirá enlaces de redirección dinámicos para medir cada clic en la firma en tiempo real.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleCopyHtml}
                className={`flex items-center justify-center gap-2 py-3 px-5 rounded-lg font-bold text-xs shadow-sm border transition-all active:scale-95 ${
                  copiedHtml 
                    ? 'bg-[#2d544c] border-[#2d544c] text-white' 
                    : 'bg-[#eaf0f6] border-[#cbd6e2] hover:bg-[#cbd6e2] text-[#2d544c]'
                }`}
              >
                {copiedHtml ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡HTML COPIADO CON ÉXITO!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>COPIAR CÓDIGO HTML (Recomendado)</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCopyText}
                className={`flex items-center justify-center gap-2 py-3 px-5 rounded-lg font-bold text-xs shadow-sm border transition-all active:scale-95 ${
                  copiedText 
                    ? 'bg-[#2d544c] border-[#2d544c] text-white' 
                    : 'bg-white border-[#cbd6e2] hover:bg-[#f5f8fa] text-[#516f90]'
                }`}
              >
                {copiedText ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡TEXTO PLANO COPIADO!</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>COPIAR EN TEXTO PLANO</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-xs text-blue-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-blue-600" />
              <div>
                <p className="font-bold">¿Cómo instalarla en tu gestor de correo?</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Haz clic en <strong>COPIAR CÓDIGO HTML</strong>.</li>
                  <li>Ve a la configuración de firmas en Gmail, Outlook o Apple Mail.</li>
                  <li>Crea una nueva firma y pega (<code>Ctrl+V</code> o <code>Cmd+V</code>) directamente el contenido copiado en la caja visual del editor de firmas de tu correo.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
