using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Xml;

if (args.Length >= 2 && args[0] == "--verify")
{
    var signedXmlPath = args[1];
    var verifyXml = File.ReadAllText(signedXmlPath, new UTF8Encoding(false));
    var verifyDocument = new XmlDocument { PreserveWhitespace = false };
    verifyDocument.LoadXml(verifyXml);
    var signatureNode = verifyDocument.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl)[0] as XmlElement;
    if (signatureNode is null)
    {
        Console.Error.WriteLine("Signature node not found.");
        return 4;
    }

    var verifySignedXml = new SignedXml(verifyDocument);
    verifySignedXml.LoadXml(signatureNode);
    if (!verifySignedXml.CheckSignature())
    {
        Console.Error.WriteLine("Signature verification failed.");
        return 5;
    }

    Console.WriteLine("OK");
    return 0;
}

if (args.Length < 5)
{
    Console.Error.WriteLine("Usage: DgiiXmlSigner <input.xml> <certificate.p12> <password.txt> <output.xml> <modern-sha256|legacy-sha1>");
    Console.Error.WriteLine("   or: DgiiXmlSigner --verify <signed.xml>");
    return 2;
}

var inputXmlPath = args[0];
var certificatePath = args[1];
var passwordPath = args[2];
var outputXmlPath = args[3];
var mode = args[4];

var xml = File.ReadAllText(inputXmlPath, new UTF8Encoding(false));
var password = File.ReadAllText(passwordPath, new UTF8Encoding(false));

var document = new XmlDocument { PreserveWhitespace = false };
document.LoadXml(xml);

var certificate = new X509Certificate2(
    certificatePath,
    password,
    X509KeyStorageFlags.Exportable
);

using var privateKey = certificate.GetRSAPrivateKey();
if (privateKey is null)
{
    Console.Error.WriteLine("Certificate does not contain an RSA private key.");
    return 3;
}

var signedXml = new SignedXml(document)
{
    SigningKey = privateKey,
};

signedXml.SignedInfo.CanonicalizationMethod = SignedXml.XmlDsigCanonicalizationUrl;
signedXml.SignedInfo.SignatureMethod = mode == "legacy-sha1"
    ? SignedXml.XmlDsigRSASHA1Url
    : SignedXml.XmlDsigRSASHA256Url;

var reference = new Reference
{
    Uri = "",
    DigestMethod = mode == "legacy-sha1"
        ? SignedXml.XmlDsigSHA1Url
        : SignedXml.XmlDsigSHA256Url,
};
reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
signedXml.AddReference(reference);

var keyInfo = new KeyInfo();
keyInfo.AddClause(new KeyInfoX509Data(certificate));
signedXml.KeyInfo = keyInfo;

signedXml.ComputeSignature();
document.DocumentElement!.AppendChild(document.ImportNode(signedXml.GetXml(), true));

var writerSettings = new XmlWriterSettings
{
    Encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
    Indent = true,
    NewLineChars = "\r\n",
    OmitXmlDeclaration = false,
};

using var writer = XmlWriter.Create(outputXmlPath, writerSettings);
document.Save(writer);
return 0;
