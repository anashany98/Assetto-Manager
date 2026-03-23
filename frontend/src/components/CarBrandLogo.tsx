// import { motion } from 'framer-motion';

// Mapping of car model strings (regex) to logo filenames
// Ideally these logos should exist in /public/brands/
const BRANDS: Record<string, string> = {
    'ferrari': 'ferrari.svg',
    'porsche': 'porsche.svg',
    'bmw': 'bmw.svg',
    'mercedes': 'mercedes.svg',
    'audi': 'audi.svg',
    'lamborghini': 'lamborghini.svg',
    'mclaren': 'mclaren.svg',
    'aston': 'aston_martin.svg',
    'honda': 'honda.svg',
    'toyota': 'toyota.svg',
    'nissan': 'nissan.svg',
    'mazda': 'mazda.svg',
    'ford': 'ford.svg',
    'chevrolet': 'chevrolet.svg',
    'lotus': 'lotus.svg',
    'tatuus': 'tatuus.svg',
    'abarth': 'abarth.svg',
    'alfa': 'alfa_romeo.svg',
    'ks_': 'kunos.svg', // Kunos official content often has ks_ prefix
    'rss': 'rss.svg',   // Race Sim Studio
    'vrc': 'vrc.svg',   // VRC Modding
};

export const CarBrandLogo = ({ carModel, className = "w-8 h-8" }: { carModel: string, className?: string }) => {
    const modelLower = (carModel || '').toLowerCase();

    // Find matching brand
    const brandKey = Object.keys(BRANDS).find(key => modelLower.includes(key));
    const logoFile = brandKey ? BRANDS[brandKey] : null;

    if (!logoFile) {
        // Fallback: Text or Generic Icon
        return (
            <div className={`flex items-center justify-center bg-gray-700 rounded p-1 ${className}`} title={carModel}>
                <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase truncate px-1">
                    {modelLower.substring(0, 3)}
                </span>
            </div>
        );
    }

    return (
        <div className={`relative flex items-center justify-center ${className}`} title={carModel}>
            {/* Using a placeholder service if local files are missing, 
                 IN PRODUCTION: Replace src with `/brands/${logoFile}` */}
            <img
                src={`https://cdn.worldvectorlogo.com/logos/${logoFile.replace('.svg', '')}.svg`}
                onError={(e) => {
                    // Fallback if CDN fails
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
                className="w-full h-full object-contain filter drop-shadow-md"
                alt={brandKey}
            />
            <div className="hidden absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)] rounded text-[8px] text-[var(--text-tertiary)]">
                {brandKey?.toUpperCase().slice(0, 3)}
            </div>
        </div>
    );
};
