// Javascript for the NGI Stockholm Internal Dashboard
var plot_height = 415;
var num_months = 6;
var start_date = moment().subtract(num_months, 'months').format('YYYY-MM');

$(function () {

    try {

        Highcharts.setOptions({
            colors: ['#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628','#f781bf','#999999','#e41a1c'],
            chart: {
                style: {
                    fontFamily:'"Roboto", "Helvetica Neue", Helvetica, Arial, sans-serif'
                }
            },
            plotOptions: { series: { animation: false } }
        });

        // Header clock
        updateClock();

        // Cron job runs on the hour, every hour. Get the web page to reload at 5 past the next hour
        var reloadDelay = moment().add(1, 'hours').startOf('hour').add(5, 'minutes').diff();
        setTimeout(function(){ location.reload(); }, reloadDelay );
        console.log("Reloading page in "+Math.floor(reloadDelay/(1000*60))+" minutes");

        // Check that the returned data is ok
        if ('error_status' in data){
            $('.mainrow').html('<div class="alert alert-danger text-center" style="margin: 100px 50px;"><p><strong>Error loading dashboard data (API)</strong><br>'+data['page_title']+': '+data['error_status']+' ('+data['error_reason']+')</p></div><pre style="margin: 100px 50px;"><code>'+data['error_exception']+'</code></pre>');
            console.log(data['error_reason']);
            console.log(data['error_status']);
            console.log(data['page_title']);
            console.log(data['error_exception']);
            // Try reloading in a few minutes
            setTimeout(function(){ location.reload(); }, 60000); // 1 minute
            return false;
        }

        // Projects plot
        // Get library prep projects the last num_months, subtract open library prep projects
        var ydata = collect_n_months(data['num_projects'], num_months, start_date);
        ydata = Object.keys(ydata).concat(Object.keys(data['open_projects'])).reduce(function(obj, k) {
          obj[k] = (ydata[k] || 0) - (data['open_projects'][k] || 0);
          return obj;
        }, {})
        // Get sequencing projects the last num_months, subtract open sequencing projects
        var ydata_seq = collect_n_months(data['num_seq_projects'], num_months, start_date);
        ydata_seq = Object.keys(ydata_seq).concat(Object.keys(data['open_seq_projects'])).reduce(function(obj, k) {
          obj[k] = (ydata_seq[k] || 0) - (data['open_seq_projects'][k] || 0);
          return obj;
        }, {})
        // Add open sequencing projects to open library prep projects
        var open = Object.keys(data['open_projects']).concat(Object.keys(data['open_seq_projects'])).reduce(function(obj, k) {
          obj[k] = (data['open_projects'][k] || 0) + (data['open_seq_projects'][k] || 0);
          return obj;
        }, {})
        // Sum projects count
        var open_projs = Object.keys(open).map(function(a){return open[a]}).reduce(function(a,b){return a+b});
        var all_projs = Object.keys(ydata).map(function(a){return ydata[a]}).reduce(function(a,b){return a+b}) +
             Object.keys(ydata_seq).map(function(a){return ydata_seq[a]}).reduce(function(a,b){return a+b});
        var subtitle = all_projs+' since '+start_date+', '+open_projs+' currently open';
        make_bar_plot('#num_projects_plot', '# Projects ', undefined, subtitle, true, {'Library prep': ydata, 'Sequencing only': ydata_seq, 'Ongoing': open});

        // Samples plot
        var ydata = collect_n_months(data['num_samples'], num_months, start_date);
        var ydata_seq = collect_n_months(data['num_seq_samples'], num_months, start_date);
        var all_samples = Object.keys(ydata).map(function(a){return ydata[a]}).reduce(function(a,b){return a+b}) +
             Object.keys(ydata_seq).map(function(a){return ydata_seq[a]}).reduce(function(a,b){return a+b});
        var subtitle = all_samples+' since '+start_date;
        make_bar_plot('#num_samples_plot', '# Samples ', undefined, subtitle, true, {'Library prep': ydata, 'Sequencing only': ydata_seq});

        // Species plot
        //make_species_plot('#species_plot');

        // Delivery times plot
        make_delivery_times_plot();

        // Finished Library turn-around-time plot
        make_finished_lib_median_plot();

        // Affiliations plot
        make_affiliations_plot();

        // Throughput plot
        make_throughput_plot();

    } catch(err){
        $('.mainrow').html('<div class="alert alert-danger text-center" style="margin: 100px 50px;"><p><strong>Error loading dashboard data</strong></p></div><pre style="margin: 100px 50px;"><code>'+err+'</code></pre>');
        console.log(err);
        // Try reloading in a few minutes
        setTimeout(function(){ location.reload(); }, 60000); // 1 minute
    }

});

function collect_n_months(data, n, start_key) {
    var months = Object.keys(data).sort().reverse();
    var ndata = Object();
    for (i=0; i<n; i++) {
        var month = months[i];
        var mkeys = Object.keys(data[months[i]]);
        for (j=0; j<mkeys.length; j++) {
            var mdata = data[months[i]][mkeys[j]];
            if (ndata.hasOwnProperty(mkeys[j])) {
                ndata[mkeys[j]] += mdata;
            }
            else {
                ndata[mkeys[j]] = mdata;
            }
        }
        if (typeof start_key !== 'undefined' && month == start_key) {
            break;
        }

    }
    return ndata;
}

// Make a bar plot
function make_bar_plot(target, title, axisTitle, subtitle ,enableLegend, ydata){
    try {
        if(target === undefined){ throw 'Target missing'; }
        if(ydata === undefined){ throw 'Data missing'; }
        if(title === undefined){ title = null; }
        if(axisTitle === undefined){ axisTitle = null; }

        var iseries = [];
        var total_count = 0;
        var set_cats = {};

        // Do it once to get the catagories
        for (var i=0; i<Object.keys(ydata).length; i++) {
            var idata = ydata[Object.keys(ydata)[i]];
            var cats = Object.keys(idata).sort(function(a,b){return idata[a]-idata[b]}).reverse();
            for(var j=0; j<cats.length; j++){
              (set_cats[cats[j]] === undefined) ? set_cats[cats[j]]=idata[cats[j]] : set_cats[cats[j]]=set_cats[cats[j]]+idata[cats[j]];
            }
        }
        // Do it twice to get the data or w.e
        for (var i=0; i<Object.keys(ydata).length; i++) {
            var idata = ydata[Object.keys(ydata)[i]];
            var cats = Object.keys(set_cats).sort(function(a,b){return set_cats[a]-set_cats[b]}).reverse();
            var sorted_idata = [];
            for(var j=0; j<cats.length; j++){
                if (idata[cats[j]] === undefined) {idata[cats[j]] = 0;}
                sorted_idata.push(idata[cats[j]]);
                total_count += idata[cats[j]];
            }
            iseries.push({"name": Object.keys(ydata)[i], "data": sorted_idata});
        }
        var nice_cats = Object.keys(set_cats).sort(function(a,b){return set_cats[a]-set_cats[b]}).reverse();
        subtitle = subtitle;
        $(target).highcharts({
            colors: ['#315a7b', '#377eb8', '#4daf4a'],
            chart: {
                type: 'bar',
                height: plot_height,
                plotBackgroundColor: null,
            },
            title: {
                text: title,
                style: { 'font-size': '24px' }
            },
            subtitle: {
                text: subtitle,
            },
            tooltip: {
                shared: true,
                headerFormat: '',
                pointFormat: '<span style="color:{series.color}; font-weight:bold;">{series.name}</span>: {point.y}<br/>'
            },
            credits: { enabled: false },
            xAxis: {
                categories: nice_cats
            },
            yAxis: {
                min: 0,
                title: { text: axisTitle },
                stackLabels: { enabled: true }
            },
            legend: {
                reversed: true,
                floating: true,
                y: -30,
                x: 150,
                layout: 'vertical',
                enabled: enableLegend
            },
            plotOptions: {
                bar: {
                    borderWidth: 0,
                    groupPadding: 0.1,
                },
                series: {
                    stacking: 'normal'
                }
            },
            series: iseries
        });
    } catch(err) {
        $(target).addClass('coming_soon').text('coming soon');
        console.log(err);
    }
}


function make_delivery_times_plot(){
    var ydata = collect_n_months(data['delivery_times'], num_months, start_date);
    var ykeys = Object.keys(ydata).sort(function(a,b){ return a.match(/\d+/)-b.match(/\d+/) });
    var pdata = Array();
    for(i=0; i<ykeys.length; i++){ pdata.push([ykeys[i], ydata[ykeys[i]]]); }
    var d = new Date();

    $('#delivery_times_plot').highcharts({
        chart: {
            plotBackgroundColor: null,
            plotBorderWidth: 0,
            plotShadow: false,
            height: plot_height * 0.65,
        },
        title: {
            text: 'Delivery Times',
            style: { 'font-size': '24px' }
        },
        subtitle: {
            text: 'Measured from sample QC pass to data delivery dates <br/>for projects started since '+start_date,
        },
        credits: { enabled: false },
        tooltip: {
            headerFormat: '',
            pointFormat: '<span style="color:{point.color}; font-weight:bold;">{point.name}eeks</span>: {point.y} projects'
        },
        plotOptions: {
            pie: {
                // dataLabels: { enabled: false },
                dataLabels: {
                    enabled: true,
                    formatter: function() {
                        return Math.round(this.percentage*100)/100 + ' %';
                    },
                    distance: -40,
                    style: {
                        fontWeight: 'bold',
                        color: 'white',
                        textShadow: '0px 1px 2px black',
                        'font-size': '18px'
                    }
                },
                showInLegend: true,
                startAngle: -90,
                endAngle: 90,
                size: '210%',
                center: ['50%', '100%']
            }
        },
        legend: {
            enabled: true,
            floating: true,
            y: 20
        },
        series: [{
            type: 'pie',
            name: 'Delivery Times',
            innerSize: '50%',
            data: pdata
        }]
    });
}


function make_finished_lib_median_plot(){
    var months = Object.keys(deliverytimes_data).sort().reverse().slice(0,5).reverse();
    var ydata = [];
    for (i=0; i<months.length; i++) {
        try {
            tmp = ydata.concat(deliverytimes_data[months[i]]['Sequencing Only']);
            ydata = tmp;
        } catch(err) {continue;}
    }

    var median;
    ydata.sort( function(a,b) {return a - b;} );
    var half = Math.floor(ydata.length/2);
    if(ydata.length % 2)
        median = ydata[half];
    else
        median = (ydata[half-1] + ydata[half]) / 2.0;


    $('#finished_lib_median_tat').highcharts({
        chart: {
            type: 'bar',
            height: 100,
            spacingLeft: 100,
            spacingRight: 100,
            spacingBottom: 10,
            spacingTop: 0,
            backgroundColor:'rgba(255, 255, 255, 0.1)',
            plotBackgroundColor:'#ed8c83',
            plotBorderColor: '#FFFFFF',
            plotBorderWidth: 14
        },
        xAxis: {
            categories: ['Queue'],
            title: { text: null },
            labels: { enabled: false },
            tickWidth: 0,
            lineWidth: 0
        },
        yAxis: [{
            opposite: true,
            min: 0,
            max: 6,
            title: {
                text: 'Median turn around time for <br> sequencing-ready libraries (since '+months[0]+'): <strong>'+median+' days</strong>',
                y: -20,
                style: { 'font-size': 12 }
            },
            labels: { enabled: false },
            gridLineWidth: 0
        },{
            min: 0,
            max: 30,
            title: { text: null },
            startOnTick: false,
            labels: {
                format: '{value} w',
                y: 15
            },
            tickPositions: [ 0, 1, 2, 3, 4, 5 ],
            gridLineWidth: 0,
            plotBands: [{
                color: '#87BA7D',
                from: 0,
                to: 3
            },{
                color: '#EDD983',
                from: 3,
                to: 4
            },{
                color: '#ED8C83',
                from: 4,
                to: 20
            }],
            plotLines: [{
                name: 'Finished Lib TaT',
                color : '#666666',
                dataLabels: { enabled: true },
                width: 4,
                zIndex: 1000,
                value: median/7
            }]
        }],
        title: { text: null },
        legend: { enabled: false },
        credits: { enabled: false },
        series: [
            { data: [0] },
            { data: [0], yAxis: 1 }
        ]
    });
}


function make_affiliations_plot(){
    var ydata = collect_n_months(data['project_user_affiliations'], num_months, start_date);
    var ykeys = Object.keys(ydata).sort(function(a,b){return ydata[a]-ydata[b]}).reverse();
    var pdata = Array();
    for(i=0; i<ykeys.length; i++){
        var thiskey = ykeys[i];
        if(data['key_names'][thiskey] != undefined){
            thiskey = data['key_names'][thiskey];
        }
        pdata.push([thiskey, ydata[ykeys[i]]]);

    }

    $('#affiliations_plot').highcharts({
        chart: {
            plotBackgroundColor: null,
            height: plot_height,
            type:'pie'
        },
        title: {
            text: 'Project Affiliations',
            style: { 'font-size': '24px' }
        },
        subtitle: {
            text: 'Projects started since '+start_date,
        },
        credits: { enabled: false },
        tooltip: {
            headerFormat: '',
            pointFormat: '<span style="color:{point.color}; font-weight:bold;">{point.name}</span>: {point.y} projects'
        },
        plotOptions: {
            pie: {
                dataLabels: { enabled: false },
                showInLegend: true,
            }
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'top',
            y: 100,
            itemStyle: {
                'font-size': '12px',
                'font-weight': 'normal'
            }
        },
        series: [{ data: pdata }]
    });
}


function make_throughput_plot(){
    var num_weeks = 12;
    var weeks = Object.keys(data['bp_seq_per_week']).sort().reverse().slice(0,num_weeks+1).reverse();
    var skeys = Array('NovaSeq 6000', 'NovaSeqXPlus', 'NextSeq 2000', 'Miseq');
    // Collect all series types
    for(i=0; i<num_weeks; i++){
        var wkeys = Object.keys(data['bp_seq_per_week'][weeks[i]]);
        for(j=0; j<wkeys.length; j++){
            if(skeys.indexOf(wkeys[j]) == -1){
                skeys.push(wkeys[j]);
            }
        }
    }
    // Collect the data
    var sdata = Array();
    var total_count = 0;
    for(j=0; j<skeys.length; j++){
        var swdata = Array();
        for(i=0; i<num_weeks; i++){
            thisdata = data['bp_seq_per_week'][weeks[i]][skeys[j]];
            swdata.push(thisdata == undefined ? 0 : thisdata);
            total_count += thisdata == undefined ? 0 : thisdata;
        }
        sdata.push({
            name: skeys[j],
            data: swdata
        });
    }
    // Subtitle text
    var bp_per_day = total_count / (num_weeks * 7);
    var minutes_per_genome = 3236336281 / (bp_per_day / (24*60));
    var subtitle_text = 'Average for past '+num_weeks+' weeks: '+parseInt(bp_per_day/1000000000)+' Gbp per day <br>(1 Human genome equivalent every '+minutes_per_genome.toFixed(2)+' minutes)';

    $('#throughput_plot').highcharts({
        chart: {
            plotBackgroundColor: null,
            height: plot_height,
            type: 'area'
        },
        title: {
            text: 'Sequencing Throughput',
            style: { 'font-size': '24px' }
        },
        subtitle: {
            text: subtitle_text
        },
        xAxis: {
            labels: {
                formatter: function() {
                    return weeks[this.value];
                },
                rotation: -30,
            },
            tickInterval: 1,
            title: { enabled: false },
        },
        yAxis: {
            title: { text: 'Base Pairs' },
            labels: {
                formatter: function () {
                    return this.value.toExponential();
                }
            }
        },
        credits: { enabled: false },
        tooltip: {
            shared: true,
            useHTML: true,
            formatter: function(){
                tt = '<strong>Week of '+weeks[this.x]+'</strong><br><table>';
                for(i=0; i<this.points.length; i++){
                    tt += '<tr><td style="padding-right: 15px;"><span style="color:'+this.points[i].color+';">'
                    tt += this.points[i].series.name+'</span>:</td><td class="text-right">'
                    tt += parseInt(this.points[i].y/1000000000)+' Gbp</td></tr>';
                }
                tt += '<tr style="border-top: 1px solid #333;"><td><strong>Total:</strong></td>';
                tt += '<td>'+parseInt(this.points[0].total/1000000000)+' Gbp</td></tr></table>';
                return tt;
            }
        },
        plotOptions: {
            area: {
                stacking: 'normal',
                lineColor: '#999999',
                lineWidth: 1,
                marker: { enabled: false }
            }
        },
        legend: {
            enabled: true,
            floating: true,
            layout: 'horizontal',
            align: 'left',
            verticalAlign: 'top',
            y: 80,
            x: 90,
            itemStyle: { 'font-weight': 'normal' },
            backgroundColor: ((Highcharts.theme && Highcharts.theme.legendBackgroundColor) || '#FFFFFF'),
        },
        series: sdata
    });
}


function updateClock(){
    var now = moment(),
        second = now.seconds() * 6,
        minute = now.minutes() * 6 + second / 60,
        hour = ((now.hours() % 12) / 12) * 360 + 90 + minute / 12;

    $('#hour').css("transform", "rotate(" + hour + "deg)");
    $('#minute').css("transform", "rotate(" + minute + "deg)");
    $('#second').css("transform", "rotate(" + second + "deg)");
    $('#clock_time').text( moment().format('HH:mm') );
    $('#clock_date').text( moment().format('dddd Do MMMM') );

    var updated = moment($('#date_rendered').text());
    $('#report_age').text( moment().from(updated, true) );
    setTimeout(updateClock, 1000);
}
