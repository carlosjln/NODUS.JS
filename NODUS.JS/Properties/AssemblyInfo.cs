using System.Reflection;
using System.Runtime.InteropServices;

[assembly: Guid( "9047160d-eeac-4935-b5d6-62be4618bb48" )]

[assembly: AssemblyTitle( "NODUS.JS" )]
[assembly: AssemblyProduct("NODUS.JS")]
[assembly: AssemblyDescription( "Front End behaviour for NODUS" )]

[assembly: AssemblyCompany("Carlos J. López")]
[assembly: AssemblyCopyright("Copyright © 2013 Carlos J. López")]
[assembly: AssemblyTrademark("")]

[assembly: AssemblyVersion( "1.0.0" )]
//[assembly: AssemblyFileVersion( "1.0.0.*" )]
//[assembly: AssemblyInformationalVersion("1.0.1")]

#if DEBUG
[assembly: AssemblyConfiguration("Debug")]
#else
[assembly: AssemblyConfiguration("Release")]
#endif

[assembly: ComVisible( false )]
[assembly: AssemblyCulture( "" )]