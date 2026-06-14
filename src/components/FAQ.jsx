import React from 'react';

const ChevronDown = () => (
  <svg className="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const faqData = [
  {
    question: 'Referans Kontrol Nedir?',
    answer: 'Referans Kontrol, akademik yazılarınızdaki kaynakça referanslarını otomatik olarak tespit edip OpenAlex, Crossref ve Semantic Scholar gibi uluslararası akademik veritabanlarında doğrulayan bir araçtır. Yapay zekâ ile üretilen sahte atıfları tespit etmenize yardımcı olur.',
  },
  {
    question: 'Referans Doğrulayıcı Nasıl Çalışır?',
    answer: 'Dosyanızı (PDF, DOCX, TXT) yükleyin veya kaynakça metninizi yapıştırın. Sistem otomatik olarak her referansı ayrıştırır, yazar, yıl ve başlık bilgilerini çıkarır ve birden fazla akademik veritabanında arar. Bulunan eşleşmeler güven skoru ile raporlanır.',
  },
  {
    question: 'Hangi Akademik Veritabanlarını Kullanıyorsunuz?',
    answer: 'Şu anda OpenAlex (250M+ akademik eser), Crossref (DOI ve metadata), ve Semantic Scholar veritabanlarını kullanıyoruz. Bu veritabanları dünya genelindeki akademik yayınların büyük çoğunluğunu kapsar.',
  },
  {
    question: 'Desteklenen Dosya Formatları Nelerdir?',
    answer: 'PDF, DOCX (Word) ve TXT (düz metin) dosyalarını destekliyoruz. Ayrıca doğrudan metin yapıştırarak da referanslarınızı kontrol edebilirsiniz. Kaynakça bölümünüzün "Kaynakça", "Kaynaklar" veya "References" başlığıyla başlaması önerilir.',
  },
  {
    question: 'Verilerim Güvende mi?',
    answer: 'Tüm işlemler tamamen tarayıcınızda gerçekleşir. Dosyalarınız herhangi bir sunucuya yüklenmez. Sadece referans arama sorguları akademik API\'lara gönderilir.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = React.useState(null);

  return (
    <section className="faq-section">
      <h2>Sıkça Sorulan Sorular</h2>
      <div className="faq-list">
        {faqData.map((item, index) => (
          <div
            key={index}
            className={`faq-item ${openIndex === index ? 'open' : ''}`}
          >
            <button
              className="faq-question"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              aria-expanded={openIndex === index}
            >
              {item.question}
              <ChevronDown />
            </button>
            <div className="faq-answer">
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
